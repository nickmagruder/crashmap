import { prisma } from '@/lib/prisma'

import type { CrashFilter, Resolvers } from './__generated__/types'

// ── Severity bucket mapping ───────────────────────────────────────────────────
// Maps display bucket names to their raw DB values in MostSevereInjuryType.
// New raw values from future data imports will fall through to rawToBucket's
// passthrough return, so they render as-is rather than silently disappearing.

export const SEVERITY_BUCKETS: Record<string, string[]> = {
  Death: ['Dead at Scene', 'Died in Hospital', 'Dead on Arrival'],
  'Major Injury': ['Suspected Serious Injury'],
  'Minor Injury': ['Suspected Minor Injury', 'Possible Injury'],
  None: ['No Apparent Injury', 'Unknown'],
}

const NONE_VALUES = SEVERITY_BUCKETS['None']

export function rawToBucket(raw: string | null | undefined): string | null {
  if (!raw) return null
  for (const [bucket, values] of Object.entries(SEVERITY_BUCKETS)) {
    if (values.includes(raw)) return bucket
  }
  return raw // unmapped value — pass through as-is
}

// Expand display bucket names to the raw DB values they represent.
// Accepts nullable elements because the generated CrashFilter.severity type is
// Array<string | null | undefined> (GraphQL [String] allows null list items).
export function bucketsToRawValues(buckets: ReadonlyArray<string | null | undefined>): string[] {
  return buckets.flatMap((b) => (b ? (SEVERITY_BUCKETS[b] ?? [b]) : []))
}

// ── Build Prisma where clause from GraphQL filter input ───────────────────────

export function buildWhere(filter?: CrashFilter | null) {
  const { severity, mode, state, county, city, dateFrom, dateTo, year, bbox, includeNoInjury } =
    filter ?? {}

  // Severity: if buckets specified, expand to raw values; otherwise exclude None by default.
  let severityWhere = {}
  if (severity && severity.length > 0) {
    severityWhere = { mostSevereInjuryType: { in: bucketsToRawValues(severity) } }
  } else if (!includeNoInjury) {
    severityWhere = { mostSevereInjuryType: { notIn: NONE_VALUES } }
  }

  // Date range: year shortcut takes precedence over dateFrom/dateTo.
  let dateWhere = {}
  if (year) {
    dateWhere = {
      crashDate: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) },
    }
  } else if (dateFrom || dateTo) {
    dateWhere = {
      crashDate: {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      },
    }
  }

  // Bounding box: lat/lng column range query.
  const bboxWhere = bbox
    ? {
        latitude: { gte: bbox.minLat, lte: bbox.maxLat },
        longitude: { gte: bbox.minLng, lte: bbox.maxLng },
      }
    : {}

  return {
    ...(mode ? { mode } : {}),
    ...(state ? { stateOrProvinceName: state } : {}),
    ...(county ? { countyName: county } : {}),
    ...(city ? { cityName: city } : {}),
    ...dateWhere,
    ...bboxWhere,
    ...severityWhere,
  }
}

// ── Resolvers ─────────────────────────────────────────────────────────────────
// Typed with the generated Resolvers type — argument types, parent types, and
// return types are all enforced. Crash field resolvers receive CrashData
// (Prisma model) as parent, via the mapper in codegen.ts.

export const resolvers: Resolvers = {
  Query: {
    crashes: async (_, { filter, limit, offset }) => {
      const where = buildWhere(filter)
      const cappedLimit = Math.min(limit ?? 1000, 5000)
      const [items, totalCount] = await Promise.all([
        prisma.crashData.findMany({ where, skip: offset ?? 0, take: cappedLimit }),
        prisma.crashData.count({ where }),
      ])
      return { items, totalCount }
    },

    crash: async (_, { colliRptNum }) => prisma.crashData.findUnique({ where: { colliRptNum } }),

    crashStats: async (_, { filter }) => {
      const where = buildWhere(filter)
      const deathValues = SEVERITY_BUCKETS['Death']

      const [totalCrashes, totalFatal, modeGroups, severityGroups, countyGroups] =
        await Promise.all([
          prisma.crashData.count({ where }),
          prisma.crashData.count({
            where: { ...where, mostSevereInjuryType: { in: deathValues } },
          }),
          prisma.crashData.groupBy({ by: ['mode'], where, _count: { _all: true } }),
          prisma.crashData.groupBy({
            by: ['mostSevereInjuryType'],
            where,
            _count: { _all: true },
          }),
          prisma.crashData.groupBy({
            by: ['countyName'],
            where,
            _count: { _all: true },
            orderBy: { _count: { countyName: 'desc' } },
          }),
        ])

      // Multiple raw DB values share a bucket (e.g. "Dead at Scene" + "Died in Hospital" → "Death").
      // Sum counts by bucket before returning.
      const bucketTotals = new Map<string, number>()
      for (const g of severityGroups) {
        const bucket = rawToBucket(g.mostSevereInjuryType) ?? 'Unknown'
        bucketTotals.set(bucket, (bucketTotals.get(bucket) ?? 0) + g._count._all)
      }

      return {
        totalCrashes,
        totalFatal,
        byMode: modeGroups.map((g) => ({ mode: g.mode ?? 'Unknown', count: g._count._all })),
        bySeverity: Array.from(bucketTotals.entries()).map(([severity, count]) => ({
          severity,
          count,
        })),
        byCounty: countyGroups.map((g) => ({
          county: g.countyName ?? 'Unknown',
          count: g._count._all,
        })),
      }
    },

    // filterOptions returns an empty object — the real data is resolved field-by-field below.
    filterOptions: () => ({}),
  },

  // ── Crash field resolvers ─────────────────────────────────────────────────
  // Only fields where the GraphQL name differs from the Prisma field name (or
  // where a type transform is needed) require explicit resolvers. All other
  // fields (colliRptNum, jurisdiction, latitude, longitude, mode, etc.) resolve
  // automatically by name match.
  // Parent type is CrashData (Prisma model) — enforced by the generated Resolvers type.

  Crash: {
    state: (parent) => parent.stateOrProvinceName,
    region: (parent) => parent.regionName,
    county: (parent) => parent.countyName,
    city: (parent) => parent.cityName,
    date: (parent) => parent.fullDate,
    time: (parent) => parent.fullTime,
    severity: (parent) => rawToBucket(parent.mostSevereInjuryType),
    // crashDate is a Date object from Prisma — format as YYYY-MM-DD string.
    crashDate: (parent) => parent.crashDate?.toISOString().slice(0, 10) ?? null,
  },

  // ── FilterOptions field resolvers ─────────────────────────────────────────
  // These query the filter_metadata and available_years materialized views.
  // Field-level arguments (e.g. counties(state)) are passed as the second arg.

  FilterOptions: {
    states: async () => {
      const rows = await prisma.$queryRaw<{ state: string }[]>`
        SELECT DISTINCT state FROM filter_metadata WHERE state IS NOT NULL ORDER BY state
      `
      return rows.map((r) => r.state)
    },

    counties: async (_, { state }) => {
      const rows = state
        ? await prisma.$queryRaw<{ county: string }[]>`
            SELECT DISTINCT county FROM filter_metadata
            WHERE state = ${state} AND county IS NOT NULL ORDER BY county
          `
        : await prisma.$queryRaw<{ county: string }[]>`
            SELECT DISTINCT county FROM filter_metadata WHERE county IS NOT NULL ORDER BY county
          `
      return rows.map((r) => r.county)
    },

    cities: async (_, { state, county }) => {
      const rows =
        state && county
          ? await prisma.$queryRaw<{ city: string }[]>`
              SELECT DISTINCT city FROM filter_metadata
              WHERE state = ${state} AND county = ${county} AND city IS NOT NULL ORDER BY city
            `
          : state
            ? await prisma.$queryRaw<{ city: string }[]>`
                SELECT DISTINCT city FROM filter_metadata
                WHERE state = ${state} AND city IS NOT NULL ORDER BY city
              `
            : await prisma.$queryRaw<{ city: string }[]>`
                SELECT DISTINCT city FROM filter_metadata WHERE city IS NOT NULL ORDER BY city
              `
      return rows.map((r) => r.city)
    },

    years: async () => {
      const rows = await prisma.$queryRaw<{ year: number }[]>`
        SELECT year FROM available_years ORDER BY year DESC
      `
      return rows.map((r) => Number(r.year))
    },

    severities: () => ['Death', 'Major Injury', 'Minor Injury', 'None'],

    modes: () => ['Bicyclist', 'Pedestrian'],
  },
}
