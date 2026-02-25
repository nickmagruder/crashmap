import type {
  DateFilter,
  DatePreset,
  FilterState,
  ModeFilter,
  SeverityBucket,
} from '@/context/FilterContext'
import { DEFAULT_SEVERITY } from '@/context/FilterContext'

// The URL-serializable subset of FilterState (no derived fields).
export type UrlFilterState = {
  mode: ModeFilter
  severity: SeverityBucket[]
  includeNoInjury: boolean
  dateFilter: DateFilter
  state: string | null
  county: string | null
  city: string | null
  updateWithMovement: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_STATE = 'Washington'
const DEFAULT_SEVERITY_SET = new Set<string>(DEFAULT_SEVERITY)
const VALID_SEVERITY_BUCKETS = new Set<string>(['Death', 'Major Injury', 'Minor Injury', 'None'])
const VALID_MODES = new Set<string>(['Bicyclist', 'Pedestrian'])
const VALID_PRESETS = new Set<string>(['ytd', '90d', 'last-year', '3y'])
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isDefaultSeverity(severity: SeverityBucket[], includeNoInjury: boolean): boolean {
  if (includeNoInjury) return false
  if (severity.length !== DEFAULT_SEVERITY.length) return false
  return severity.every((b) => DEFAULT_SEVERITY_SET.has(b))
}

// ── Encode ────────────────────────────────────────────────────────────────────

/**
 * Converts the URL-serializable portion of FilterState into URLSearchParams.
 * Default values are omitted — a clean URL (no params) means the default view.
 */
export function encodeFilterParams(filterState: FilterState): URLSearchParams {
  const params = new URLSearchParams()

  // mode — omit when null (all modes)
  if (filterState.mode !== null) {
    params.set('mode', filterState.mode)
  }

  // severity — omit when it exactly matches the default 3-bucket set + no None
  if (!isDefaultSeverity(filterState.severity, filterState.includeNoInjury)) {
    const buckets: string[] = [
      ...filterState.severity,
      ...(filterState.includeNoInjury ? ['None'] : []),
    ]
    params.set('severity', buckets.join(','))
  }

  // dateFilter — omit when it's the default (ytd preset)
  const { dateFilter } = filterState
  if (dateFilter.type === 'none') {
    params.set('date', 'none')
  } else if (dateFilter.type === 'preset' && dateFilter.preset !== 'ytd') {
    params.set('date', dateFilter.preset)
  } else if (dateFilter.type === 'year') {
    params.set('year', String(dateFilter.year))
  } else if (dateFilter.type === 'range') {
    params.set('dateFrom', dateFilter.startDate)
    params.set('dateTo', dateFilter.endDate)
  }
  // preset === 'ytd' → omit (default)

  // state — omit when it matches the default ('Washington')
  if (filterState.state !== DEFAULT_STATE) {
    // null means "all states"; use sentinel so it round-trips correctly
    params.set('state', filterState.state === null ? 'none' : filterState.state)
  }

  // county/city — omit when null (decoupled: neither depends on the other)
  if (filterState.county !== null) {
    params.set('county', filterState.county)
  }
  if (filterState.city !== null) {
    params.set('city', filterState.city)
  }

  // updateWithMovement — omit when false (the default)
  if (filterState.updateWithMovement) {
    params.set('movement', '1')
  }

  return params
}

// ── Decode ────────────────────────────────────────────────────────────────────

/**
 * Parses URLSearchParams back into a UrlFilterState.
 * Falls back to application defaults for absent or invalid params.
 */
export function decodeFilterParams(params: URLSearchParams): UrlFilterState {
  // mode
  const rawMode = params.get('mode')
  const mode: ModeFilter =
    rawMode !== null && VALID_MODES.has(rawMode) ? (rawMode as ModeFilter) : null

  // severity (CSV, with 'None' doubling as includeNoInjury)
  let severity: SeverityBucket[] = [...DEFAULT_SEVERITY]
  let includeNoInjury = false
  const rawSeverity = params.get('severity')
  if (rawSeverity !== null) {
    const parsed = rawSeverity
      .split(',')
      .map((s) => s.trim())
      .filter((s) => VALID_SEVERITY_BUCKETS.has(s))
    const hasNone = parsed.includes('None')
    const nonNone = parsed.filter((s): s is SeverityBucket => s !== 'None') as SeverityBucket[]
    if (parsed.length > 0) {
      severity = nonNone
      includeNoInjury = hasNone
    }
    // if every token was invalid, fall back to defaults (severity unchanged)
  }

  // dateFilter
  let dateFilter: DateFilter = { type: 'preset', preset: 'ytd' }
  const rawDate = params.get('date')
  const rawYear = params.get('year')
  const rawDateFrom = params.get('dateFrom')
  const rawDateTo = params.get('dateTo')

  if (rawDate === 'none') {
    dateFilter = { type: 'none' }
  } else if (rawDate !== null && VALID_PRESETS.has(rawDate)) {
    dateFilter = { type: 'preset', preset: rawDate as DatePreset }
  } else if (rawDateFrom !== null && rawDateTo !== null) {
    if (ISO_DATE_RE.test(rawDateFrom) && ISO_DATE_RE.test(rawDateTo)) {
      dateFilter = { type: 'range', startDate: rawDateFrom, endDate: rawDateTo }
    }
  } else if (rawYear !== null) {
    const year = parseInt(rawYear, 10)
    if (!isNaN(year) && year >= 2000 && year <= 2100) {
      dateFilter = { type: 'year', year }
    }
  }

  // state: absent → default 'Washington'; 'none' → null; other → string
  let state: string | null = DEFAULT_STATE
  if (params.has('state')) {
    const rawState = params.get('state')!
    state = rawState === 'none' ? null : rawState
  }

  // county/city: decoupled — each can be set independently
  const rawCounty = params.get('county')
  const county: string | null = rawCounty !== null ? rawCounty : null

  const rawCity = params.get('city')
  const city: string | null = rawCity !== null ? rawCity : null

  // updateWithMovement
  const updateWithMovement = params.get('movement') === '1'

  return { mode, severity, includeNoInjury, dateFilter, state, county, city, updateWithMovement }
}
