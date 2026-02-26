import { vi, describe, it, expect, beforeEach, assert } from 'vitest'
import type { CrashData } from '@/lib/generated/prisma/client'

// ── Mock Prisma ─────────────────────────────────────────────────────────────
// vi.hoisted() returns values that are available inside vi.mock() factories,
// which are hoisted to the top of the file before any other code runs.

const mockPrisma = vi.hoisted(() => ({
  crashData: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  $queryRaw: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../typeDefs'
import { resolvers } from '../resolvers'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeCrashData(overrides: Partial<CrashData> = {}): CrashData {
  return {
    colliRptNum: 'RPT-001',
    jurisdiction: 'Test PD',
    stateOrProvinceName: 'Ohio',
    regionName: 'Central',
    countyName: 'Franklin',
    cityName: 'Columbus',
    fullDate: '2024-06-15T00:00:00',
    fullTime: '14:30:00',
    mostSevereInjuryType: 'Suspected Serious Injury',
    ageGroup: '25-34',
    involvedPersons: 2,
    crashStatePlaneX: 1234.5,
    crashStatePlaneY: 6789.0,
    latitude: 39.9612,
    longitude: -82.9988,
    mode: 'Bicyclist',
    crashDate: new Date('2024-06-15'),
    geom: null,
    ...overrides,
  } as CrashData
}

let server: ApolloServer

beforeEach(() => {
  vi.clearAllMocks()
  server = new ApolloServer({ typeDefs, resolvers })
})

// ── crashes query ───────────────────────────────────────────────────────────

describe('crashes query', () => {
  const CRASHES_QUERY = `
    query Crashes($filter: CrashFilter, $limit: Int, $offset: Int) {
      crashes(filter: $filter, limit: $limit, offset: $offset) {
        items {
          colliRptNum
          state
          county
          city
          severity
          mode
          crashDate
        }
        totalCount
      }
    }
  `

  it('returns items and totalCount', async () => {
    mockPrisma.crashData.findMany.mockResolvedValue([makeCrashData()])
    mockPrisma.crashData.count.mockResolvedValue(1)

    const result = await server.executeOperation({ query: CRASHES_QUERY })

    assert(result.body.kind === 'single')
    expect(result.body.singleResult.errors).toBeUndefined()
    const data = result.body.singleResult.data?.crashes as {
      items: Record<string, unknown>[]
      totalCount: number
    }
    expect(data.totalCount).toBe(1)
    expect(data.items).toHaveLength(1)
    expect(data.items[0].colliRptNum).toBe('RPT-001')
  })

  it('maps Crash field resolvers correctly', async () => {
    mockPrisma.crashData.findMany.mockResolvedValue([makeCrashData()])
    mockPrisma.crashData.count.mockResolvedValue(1)

    const result = await server.executeOperation({ query: CRASHES_QUERY })
    assert(result.body.kind === 'single')
    const item = (result.body.singleResult.data?.crashes as { items: Record<string, unknown>[] })
      .items[0]

    expect(item.state).toBe('Ohio')
    expect(item.county).toBe('Franklin')
    expect(item.city).toBe('Columbus')
    expect(item.severity).toBe('Major Injury') // rawToBucket('Suspected Serious Injury')
    expect(item.crashDate).toBe('2024-06-15')
  })

  it('caps limit at 40000', async () => {
    mockPrisma.crashData.findMany.mockResolvedValue([])
    mockPrisma.crashData.count.mockResolvedValue(0)

    await server.executeOperation({
      query: CRASHES_QUERY,
      variables: { limit: 50000 },
    })

    expect(mockPrisma.crashData.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 40000 })
    )
  })

  it('uses default limit of 1000', async () => {
    mockPrisma.crashData.findMany.mockResolvedValue([])
    mockPrisma.crashData.count.mockResolvedValue(0)

    await server.executeOperation({ query: CRASHES_QUERY })

    expect(mockPrisma.crashData.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1000 })
    )
  })

  it('passes offset to skip', async () => {
    mockPrisma.crashData.findMany.mockResolvedValue([])
    mockPrisma.crashData.count.mockResolvedValue(0)

    await server.executeOperation({
      query: CRASHES_QUERY,
      variables: { offset: 50 },
    })

    expect(mockPrisma.crashData.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50 })
    )
  })

  it('passes severity filter to Prisma where clause', async () => {
    mockPrisma.crashData.findMany.mockResolvedValue([])
    mockPrisma.crashData.count.mockResolvedValue(0)

    await server.executeOperation({
      query: CRASHES_QUERY,
      variables: { filter: { severity: ['Death'] } },
    })

    expect(mockPrisma.crashData.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          mostSevereInjuryType: {
            in: ['Dead at Scene', 'Died in Hospital', 'Dead on Arrival'],
          },
        }),
      })
    )
  })
})

// ── crash query ─────────────────────────────────────────────────────────────

describe('crash query', () => {
  const CRASH_QUERY = `
    query Crash($colliRptNum: ID!) {
      crash(colliRptNum: $colliRptNum) {
        colliRptNum
        severity
        mode
      }
    }
  `

  it('returns a crash when found', async () => {
    mockPrisma.crashData.findUnique.mockResolvedValue(makeCrashData())

    const result = await server.executeOperation({
      query: CRASH_QUERY,
      variables: { colliRptNum: 'RPT-001' },
    })

    assert(result.body.kind === 'single')
    expect(result.body.singleResult.errors).toBeUndefined()
    const crash = result.body.singleResult.data?.crash as Record<string, unknown>
    expect(crash.colliRptNum).toBe('RPT-001')
    expect(crash.severity).toBe('Major Injury')
  })

  it('returns null when not found', async () => {
    mockPrisma.crashData.findUnique.mockResolvedValue(null)

    const result = await server.executeOperation({
      query: CRASH_QUERY,
      variables: { colliRptNum: 'NONEXISTENT' },
    })

    assert(result.body.kind === 'single')
    expect(result.body.singleResult.data?.crash).toBeNull()
  })
})

// ── crashStats query ────────────────────────────────────────────────────────

describe('crashStats query', () => {
  const STATS_QUERY = `
    query CrashStats($filter: CrashFilter) {
      crashStats(filter: $filter) {
        totalCrashes
        totalFatal
        byMode { mode count }
        bySeverity { severity count }
        byCounty { county count }
      }
    }
  `

  it('returns aggregated stats', async () => {
    mockPrisma.crashData.count.mockResolvedValueOnce(100).mockResolvedValueOnce(5)
    mockPrisma.crashData.groupBy
      .mockResolvedValueOnce([
        { mode: 'Bicyclist', _count: { _all: 60 } },
        { mode: 'Pedestrian', _count: { _all: 40 } },
      ])
      .mockResolvedValueOnce([
        { mostSevereInjuryType: 'Dead at Scene', _count: { _all: 3 } },
        { mostSevereInjuryType: 'Suspected Serious Injury', _count: { _all: 20 } },
      ])
      .mockResolvedValueOnce([
        { countyName: 'Franklin', _count: { _all: 50 } },
        { countyName: 'Hamilton', _count: { _all: 30 } },
      ])

    const result = await server.executeOperation({ query: STATS_QUERY })

    assert(result.body.kind === 'single')
    expect(result.body.singleResult.errors).toBeUndefined()
    const stats = result.body.singleResult.data?.crashStats as Record<string, unknown>

    expect(stats.totalCrashes).toBe(100)
    expect(stats.totalFatal).toBe(5)
    expect(stats.byMode).toHaveLength(2)
    expect(stats.bySeverity).toContainEqual({ severity: 'Death', count: 3 })
    expect(stats.bySeverity).toContainEqual({ severity: 'Major Injury', count: 20 })
    expect(stats.byCounty).toHaveLength(2)
  })

  it('merges multiple raw severity values into same bucket', async () => {
    mockPrisma.crashData.count.mockResolvedValueOnce(25).mockResolvedValueOnce(10)
    mockPrisma.crashData.groupBy
      .mockResolvedValueOnce([]) // byMode
      .mockResolvedValueOnce([
        { mostSevereInjuryType: 'Dead at Scene', _count: { _all: 7 } },
        { mostSevereInjuryType: 'Dead on Arrival', _count: { _all: 3 } },
        { mostSevereInjuryType: 'Suspected Minor Injury', _count: { _all: 15 } },
        { mostSevereInjuryType: 'Possible Injury', _count: { _all: 10 } },
      ])
      .mockResolvedValueOnce([]) // byCounty

    const result = await server.executeOperation({ query: STATS_QUERY })
    assert(result.body.kind === 'single')
    const bySeverity = (result.body.singleResult.data?.crashStats as { bySeverity: unknown[] })
      .bySeverity

    expect(bySeverity).toContainEqual({ severity: 'Death', count: 10 })
    expect(bySeverity).toContainEqual({ severity: 'Minor Injury', count: 25 })
  })
})

// ── filterOptions query ─────────────────────────────────────────────────────

describe('filterOptions query', () => {
  it('returns states from raw SQL', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ state: 'Ohio' }, { state: 'Indiana' }])

    const result = await server.executeOperation({
      query: `{ filterOptions { states } }`,
    })

    assert(result.body.kind === 'single')
    expect(result.body.singleResult.data?.filterOptions).toEqual({ states: ['Ohio', 'Indiana'] })
  })

  it('returns counties filtered by state', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ county: 'Franklin' }, { county: 'Hamilton' }])

    const result = await server.executeOperation({
      query: `{ filterOptions { counties(state: "Ohio") } }`,
    })

    assert(result.body.kind === 'single')
    expect(result.body.singleResult.data?.filterOptions).toEqual({
      counties: ['Franklin', 'Hamilton'],
    })
  })

  it('returns cities filtered by state and county', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ city: 'Columbus' }, { city: 'Dublin' }])

    const result = await server.executeOperation({
      query: `{ filterOptions { cities(state: "Ohio", county: "Franklin") } }`,
    })

    assert(result.body.kind === 'single')
    expect(result.body.singleResult.data?.filterOptions).toEqual({
      cities: ['Columbus', 'Dublin'],
    })
  })

  it('returns years from raw SQL', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ year: 2024 }, { year: 2023 }, { year: 2022 }])

    const result = await server.executeOperation({
      query: `{ filterOptions { years } }`,
    })

    assert(result.body.kind === 'single')
    expect(result.body.singleResult.data?.filterOptions).toEqual({ years: [2024, 2023, 2022] })
  })

  it('returns hardcoded severities', async () => {
    const result = await server.executeOperation({
      query: `{ filterOptions { severities } }`,
    })

    assert(result.body.kind === 'single')
    expect(result.body.singleResult.data?.filterOptions).toEqual({
      severities: ['Death', 'Major Injury', 'Minor Injury', 'None'],
    })
  })

  it('returns hardcoded modes', async () => {
    const result = await server.executeOperation({
      query: `{ filterOptions { modes } }`,
    })

    assert(result.body.kind === 'single')
    expect(result.body.singleResult.data?.filterOptions).toEqual({
      modes: ['Bicyclist', 'Pedestrian'],
    })
  })
})

// ── Crash field resolver edge cases ─────────────────────────────────────────

describe('Crash field resolvers', () => {
  const CRASH_DETAIL_QUERY = `
    query Crash($id: ID!) {
      crash(colliRptNum: $id) {
        severity
        crashDate
        state
        region
        county
        city
        date
        time
      }
    }
  `

  it('severity returns null for null mostSevereInjuryType', async () => {
    mockPrisma.crashData.findUnique.mockResolvedValue(makeCrashData({ mostSevereInjuryType: null }))

    const result = await server.executeOperation({
      query: CRASH_DETAIL_QUERY,
      variables: { id: 'RPT-001' },
    })

    assert(result.body.kind === 'single')
    const crash = result.body.singleResult.data?.crash as Record<string, unknown>
    expect(crash.severity).toBeNull()
  })

  it('crashDate returns null when crashDate is null', async () => {
    mockPrisma.crashData.findUnique.mockResolvedValue(makeCrashData({ crashDate: null }))

    const result = await server.executeOperation({
      query: CRASH_DETAIL_QUERY,
      variables: { id: 'RPT-001' },
    })

    assert(result.body.kind === 'single')
    const crash = result.body.singleResult.data?.crash as Record<string, unknown>
    expect(crash.crashDate).toBeNull()
  })

  it('severity passes through unmapped raw values', async () => {
    mockPrisma.crashData.findUnique.mockResolvedValue(
      makeCrashData({ mostSevereInjuryType: 'Some Future Value' })
    )

    const result = await server.executeOperation({
      query: CRASH_DETAIL_QUERY,
      variables: { id: 'RPT-001' },
    })

    assert(result.body.kind === 'single')
    const crash = result.body.singleResult.data?.crash as Record<string, unknown>
    expect(crash.severity).toBe('Some Future Value')
  })
})
