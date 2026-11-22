'use client'

import { createContext, useContext, useReducer, type ReactNode } from 'react'
import { format, parseISO, subDays, subMonths, startOfYear, endOfYear, subYears } from 'date-fns'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SeverityBucket = 'Death' | 'Major Injury' | 'Minor Injury' | 'None'
export type ModeFilter = 'Bicyclist' | 'Pedestrian' | null

export type DatePreset = '90d' | 'ytd' | '1y' | 'last-year' | '3y'

/** First-load date preset. Omitted from the URL when active (see lib/filterUrlState.ts). */
export const DEFAULT_DATE_PRESET: DatePreset = '1y'

export type DateFilter =
  | { type: 'none' }
  | { type: 'year'; year: number }
  | { type: 'range'; startDate: string; endDate: string }
  | { type: 'preset'; preset: DatePreset }

export interface FilterState {
  mode: ModeFilter
  severity: SeverityBucket[]
  includeNoInjury: boolean
  dateFilter: DateFilter
  state: string | null // geographic state (e.g. "Washington")
  county: string | null
  city: string | null
  updateWithMovement: boolean // when true, query uses viewport bbox instead of geo text filters
  satellite: boolean // when true, map uses satellite-streets style regardless of theme
  accessibleColors: boolean // when true, uses colorblind-safe Paul Tol Muted palette
  totalCount: number | null // populated by CrashLayer after query
  isLoading: boolean // true while a filter-triggered refetch is in flight
  dataBounds: { minDate: string; maxDate: string } | null // min/max CrashDate in DB
}

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

export type FilterAction =
  | { type: 'SET_MODE'; payload: ModeFilter }
  | { type: 'SET_SEVERITY'; payload: SeverityBucket[] }
  | { type: 'TOGGLE_NO_INJURY' }
  | { type: 'SET_DATE_YEAR'; payload: number }
  | { type: 'SET_DATE_PRESET'; payload: DatePreset }
  | { type: 'SET_DATE_RANGE'; payload: { startDate: string; endDate: string } }
  | { type: 'CLEAR_DATE' }
  | { type: 'SET_STATE'; payload: string | null }
  | { type: 'SET_COUNTY'; payload: string | null }
  | { type: 'SET_CITY'; payload: string | null }
  | { type: 'SET_UPDATE_WITH_MOVEMENT'; payload: boolean }
  | { type: 'SET_SATELLITE'; payload: boolean }
  | { type: 'SET_ACCESSIBLE_COLORS'; payload: boolean }
  | { type: 'SET_TOTAL_COUNT'; payload: number | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_DATE_BOUNDS'; payload: { minDate: string; maxDate: string } }
  | { type: 'RESET' }
  | { type: 'INIT_FROM_URL'; payload: UrlFilterState }

// Matches the CrashFilter GraphQL input shape (used as Apollo query variables).
export type CrashFilterInput = {
  severity?: string[]
  mode?: string
  state?: string
  county?: string
  city?: string
  dateFrom?: string
  dateTo?: string
  year?: number
  includeNoInjury?: boolean
  bbox?: { minLat: number; minLng: number; maxLat: number; maxLng: number }
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const DEFAULT_SEVERITY: SeverityBucket[] = ['Death', 'Major Injury', 'Minor Injury']

/** True when every severity box, including None/Unknown, is unchecked, so nothing can match. */
export function hasNoSeverity(state: Pick<FilterState, 'severity' | 'includeNoInjury'>): boolean {
  return state.severity.length === 0 && !state.includeNoInjury
}

export const PRESET_LABELS: Record<DatePreset, string> = {
  '90d': '90 Days',
  ytd: 'YTD',
  '1y': '1 Year',
  'last-year': 'Last Year',
  '3y': '3 Years',
}

export const initialState: FilterState = {
  mode: null,
  severity: DEFAULT_SEVERITY,
  includeNoInjury: false,
  dateFilter: { type: 'preset', preset: DEFAULT_DATE_PRESET },
  state: 'Washington',
  county: null,
  city: null,
  updateWithMovement: false,
  satellite: false,
  accessibleColors: false,
  totalCount: null,
  isLoading: false,
  dataBounds: null,
}

// ── Reducer ───────────────────────────────────────────────────────────────────

function filterReducer(filterState: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'SET_MODE':
      return { ...filterState, mode: action.payload }
    case 'SET_SEVERITY':
      return { ...filterState, severity: action.payload }
    case 'TOGGLE_NO_INJURY':
      return { ...filterState, includeNoInjury: !filterState.includeNoInjury }
    case 'SET_DATE_YEAR':
      return { ...filterState, dateFilter: { type: 'year', year: action.payload } }
    case 'SET_DATE_PRESET':
      return { ...filterState, dateFilter: { type: 'preset', preset: action.payload } }
    case 'SET_DATE_RANGE':
      return {
        ...filterState,
        dateFilter: {
          type: 'range',
          startDate: action.payload.startDate,
          endDate: action.payload.endDate,
        },
      }
    case 'CLEAR_DATE':
      return { ...filterState, dateFilter: { type: 'none' } }
    // Cascading: selecting a new state resets county and city.
    case 'SET_STATE':
      return { ...filterState, state: action.payload, county: null, city: null }
    // County and city are decoupled — selecting one does not reset the other.
    case 'SET_COUNTY':
      return { ...filterState, county: action.payload }
    case 'SET_CITY':
      return { ...filterState, city: action.payload }
    case 'SET_UPDATE_WITH_MOVEMENT':
      return { ...filterState, updateWithMovement: action.payload }
    case 'SET_SATELLITE':
      return { ...filterState, satellite: action.payload }
    case 'SET_ACCESSIBLE_COLORS':
      return { ...filterState, accessibleColors: action.payload }
    case 'SET_TOTAL_COUNT':
      return { ...filterState, totalCount: action.payload }
    case 'SET_LOADING':
      return { ...filterState, isLoading: action.payload }
    case 'SET_DATE_BOUNDS':
      return { ...filterState, dataBounds: action.payload }
    case 'RESET':
      return initialState
    case 'INIT_FROM_URL':
      return {
        ...filterState,
        mode: action.payload.mode,
        severity: action.payload.severity,
        includeNoInjury: action.payload.includeNoInjury,
        dateFilter: action.payload.dateFilter,
        state: action.payload.state,
        county: action.payload.county,
        city: action.payload.city,
        updateWithMovement: action.payload.updateWithMovement,
      }
    default:
      return filterState
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

type FilterContextValue = {
  filterState: FilterState
  dispatch: React.Dispatch<FilterAction>
}

const FilterContext = createContext<FilterContextValue | null>(null)

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filterState, dispatch] = useReducer(filterReducer, initialState)
  return (
    <FilterContext.Provider value={{ filterState, dispatch }}>{children}</FilterContext.Provider>
  )
}

export function useFilterContext(): FilterContextValue {
  const ctx = useContext(FilterContext)
  if (!ctx) throw new Error('useFilterContext must be used within FilterProvider')
  return ctx
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Compute a concrete date range from a named preset, anchored to dataBounds.maxDate.
 * 90d, YTD, 1y and 3y use maxDate as their end anchor so they never exceed available data.
 * 1y covers the 365 days ending at maxDate (today, or the newest crash when data lags).
 * YTD starts on January 1 of maxDate's year, not today's: WSDOT reports lag by weeks, so in
 * early January today's year may have no data yet, which would put the start after the end.
 * Last Year always spans the previous complete calendar year.
 */
export function presetToDateRange(
  preset: DatePreset,
  dataBounds: { minDate: string; maxDate: string }
): { startDate: string; endDate: string } {
  const maxDate = parseISO(dataBounds.maxDate)
  const today = new Date()
  switch (preset) {
    case 'ytd':
      return { startDate: format(startOfYear(maxDate), 'yyyy-MM-dd'), endDate: dataBounds.maxDate }
    case '90d':
      return { startDate: format(subDays(maxDate, 90), 'yyyy-MM-dd'), endDate: dataBounds.maxDate }
    case '1y':
      return { startDate: format(subDays(maxDate, 365), 'yyyy-MM-dd'), endDate: dataBounds.maxDate }
    case 'last-year': {
      const lastYear = subYears(today, 1)
      return {
        startDate: format(startOfYear(lastYear), 'yyyy-MM-dd'),
        endDate: format(endOfYear(lastYear), 'yyyy-MM-dd'),
      }
    }
    case '3y':
      return {
        startDate: format(subMonths(maxDate, 36), 'yyyy-MM-dd'),
        endDate: dataBounds.maxDate,
      }
  }
}

/**
 * Convert FilterState to CrashFilter GraphQL input variables.
 * Pass this directly as the `filter` variable to Apollo queries.
 */
export function toCrashFilter(filterState: FilterState): CrashFilterInput {
  const effectiveSeverity: string[] = [
    ...filterState.severity,
    ...(filterState.includeNoInjury ? ['None'] : []),
  ]

  const dateVars = (() => {
    const { dateFilter, dataBounds } = filterState
    if (dateFilter.type === 'year') return { year: dateFilter.year }
    if (dateFilter.type === 'range')
      return { dateFrom: dateFilter.startDate, dateTo: dateFilter.endDate }
    if (dateFilter.type === 'preset' && dataBounds) {
      const { startDate, endDate } = presetToDateRange(dateFilter.preset, dataBounds)
      return { dateFrom: startDate, dateTo: endDate }
    }
    return {}
  })()

  return {
    severity: effectiveSeverity,
    ...(filterState.mode ? { mode: filterState.mode } : {}),
    ...(filterState.state ? { state: filterState.state } : {}),
    ...(filterState.county ? { county: filterState.county } : {}),
    ...(filterState.city ? { city: filterState.city } : {}),
    ...dateVars,
    includeNoInjury: filterState.includeNoInjury,
  }
}

/**
 * One active-filter badge. `icon` is decorative emoji, hidden from screen
 * readers; `text` is shown and read; `srText` is read but not shown, for
 * badges whose only visible content is an icon. Every badge needs `text` or
 * `srText`, so none is silent for screen readers.
 */
export type FilterBadgeLabel = { icon?: string } & (
  { text: string; srText?: string } | { text?: undefined; srText: string }
)

/**
 * Derive badge labels for all active (non-default) filters.
 * Used by SummaryBar to render active filter chips.
 */
export function getActiveFilterLabels(filterState: FilterState): FilterBadgeLabel[] {
  const labels: FilterBadgeLabel[] = []

  // Mode: emoji on screen, words for screen readers
  if (filterState.mode === 'Bicyclist') {
    labels.push({ icon: '🚲', srText: 'Bicyclists' })
  } else if (filterState.mode === 'Pedestrian') {
    labels.push({ icon: '🚶🏽‍♀️', srText: 'Pedestrians' })
  } else {
    labels.push({ icon: '🚲 🚶🏽‍♀️', srText: 'All modes' })
  }

  // Only flag severity when it differs from the default three-bucket set.
  const defaultSet = new Set<string>(DEFAULT_SEVERITY)
  const currentSet = new Set<string>(filterState.severity)
  const severityChanged =
    filterState.severity.some((s) => !defaultSet.has(s)) ||
    DEFAULT_SEVERITY.some((s) => !currentSet.has(s)) ||
    filterState.includeNoInjury

  if (severityChanged) {
    const all = [...filterState.severity, ...(filterState.includeNoInjury ? ['None'] : [])]
    labels.push({ text: all.length === 0 ? 'No severity' : all.join(' + ') })
  }

  // Date: shorten year to '25 format; omit state (only Washington data available)
  if (filterState.dateFilter.type === 'year') {
    labels.push({ text: `'${String(filterState.dateFilter.year).slice(2)}` })
  } else if (filterState.dateFilter.type === 'range') {
    labels.push({ text: `${filterState.dateFilter.startDate} – ${filterState.dateFilter.endDate}` })
  } else if (filterState.dateFilter.type === 'preset') {
    labels.push({ text: PRESET_LABELS[filterState.dateFilter.preset] })
  }

  // Geographic: show viewport badge when movement mode is on; otherwise show county/city
  if (filterState.updateWithMovement) {
    labels.push({ icon: '📍', text: 'Viewport' })
  } else {
    if (filterState.county) labels.push({ text: filterState.county })
    if (filterState.city) labels.push({ text: filterState.city })
  }

  return labels
}
