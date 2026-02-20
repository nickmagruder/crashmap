'use client'

import { createContext, useContext, useReducer, type ReactNode } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SeverityBucket = 'Death' | 'Major Injury' | 'Minor Injury' | 'None'
export type ModeFilter = 'Bicyclist' | 'Pedestrian' | null

export type DateFilter =
  | { type: 'none' }
  | { type: 'year'; year: number }
  | { type: 'range'; startDate: string; endDate: string }

export interface FilterState {
  mode: ModeFilter
  severity: SeverityBucket[]
  includeNoInjury: boolean
  dateFilter: DateFilter
  state: string | null // geographic state (e.g. "Washington")
  county: string | null
  city: string | null
  totalCount: number | null // populated by CrashLayer after query
  isLoading: boolean // true while a filter-triggered refetch is in flight
}

export type FilterAction =
  | { type: 'SET_MODE'; payload: ModeFilter }
  | { type: 'SET_SEVERITY'; payload: SeverityBucket[] }
  | { type: 'TOGGLE_NO_INJURY' }
  | { type: 'SET_DATE_YEAR'; payload: number }
  | { type: 'SET_DATE_RANGE'; payload: { startDate: string; endDate: string } }
  | { type: 'CLEAR_DATE' }
  | { type: 'SET_STATE'; payload: string | null }
  | { type: 'SET_COUNTY'; payload: string | null }
  | { type: 'SET_CITY'; payload: string | null }
  | { type: 'SET_TOTAL_COUNT'; payload: number | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'RESET' }

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
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const DEFAULT_SEVERITY: SeverityBucket[] = ['Death', 'Major Injury', 'Minor Injury']

const initialState: FilterState = {
  mode: null,
  severity: DEFAULT_SEVERITY,
  includeNoInjury: false,
  dateFilter: { type: 'none' },
  state: null,
  county: null,
  city: null,
  totalCount: null,
  isLoading: false,
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
    // Cascading: selecting a new county resets city.
    case 'SET_COUNTY':
      return { ...filterState, county: action.payload, city: null }
    case 'SET_CITY':
      return { ...filterState, city: action.payload }
    case 'SET_TOTAL_COUNT':
      return { ...filterState, totalCount: action.payload }
    case 'SET_LOADING':
      return { ...filterState, isLoading: action.payload }
    case 'RESET':
      return initialState
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
 * Convert FilterState to CrashFilter GraphQL input variables.
 * Pass this directly as the `filter` variable to Apollo queries.
 */
export function toCrashFilter(filterState: FilterState): CrashFilterInput {
  const effectiveSeverity: string[] = [
    ...filterState.severity,
    ...(filterState.includeNoInjury ? ['None'] : []),
  ]

  const dateVars =
    filterState.dateFilter.type === 'year'
      ? { year: filterState.dateFilter.year }
      : filterState.dateFilter.type === 'range'
        ? { dateFrom: filterState.dateFilter.startDate, dateTo: filterState.dateFilter.endDate }
        : {}

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
 * Derive human-readable badge labels for all active (non-default) filters.
 * Used by SummaryBar to render active filter chips.
 */
export function getActiveFilterLabels(filterState: FilterState): string[] {
  const labels: string[] = []

  if (filterState.mode) labels.push(filterState.mode + 's')

  // Only flag severity when it differs from the default three-bucket set.
  const defaultSet = new Set<string>(DEFAULT_SEVERITY)
  const currentSet = new Set<string>(filterState.severity)
  const severityChanged =
    filterState.severity.some((s) => !defaultSet.has(s)) ||
    DEFAULT_SEVERITY.some((s) => !currentSet.has(s)) ||
    filterState.includeNoInjury

  if (severityChanged) {
    const all = [...filterState.severity, ...(filterState.includeNoInjury ? ['None'] : [])]
    labels.push(all.length === 0 ? 'No severity' : all.join(' + '))
  }

  if (filterState.dateFilter.type === 'year') {
    labels.push(String(filterState.dateFilter.year))
  } else if (filterState.dateFilter.type === 'range') {
    labels.push(`${filterState.dateFilter.startDate} – ${filterState.dateFilter.endDate}`)
  }

  if (filterState.state) labels.push(filterState.state)
  if (filterState.county) labels.push(filterState.county)
  if (filterState.city) labels.push(filterState.city)

  return labels
}
