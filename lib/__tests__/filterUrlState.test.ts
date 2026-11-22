import { describe, expect, it } from 'vitest'
import { decodeFilterParams, encodeFilterParams } from '@/lib/filterUrlState'
import {
  DEFAULT_DATE_PRESET,
  DEFAULT_SEVERITY,
  type DateFilter,
  type FilterState,
} from '@/context/FilterContext'

function makeState(dateFilter: DateFilter): FilterState {
  return {
    mode: null,
    severity: [...DEFAULT_SEVERITY],
    includeNoInjury: false,
    dateFilter,
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
}

describe('default date preset', () => {
  it('is 1 year', () => {
    expect(DEFAULT_DATE_PRESET).toBe('1y')
  })

  it('decodes a URL with no date params to the 1y preset', () => {
    expect(decodeFilterParams(new URLSearchParams()).dateFilter).toEqual({
      type: 'preset',
      preset: '1y',
    })
  })

  it('omits the 1y preset from the URL, so the default view has a clean URL', () => {
    const params = encodeFilterParams(makeState({ type: 'preset', preset: '1y' }))
    expect(params.has('date')).toBe(false)
    expect(params.toString()).toBe('')
  })

  it('falls back to 1y for an unknown preset', () => {
    expect(decodeFilterParams(new URLSearchParams('date=bogus')).dateFilter).toEqual({
      type: 'preset',
      preset: '1y',
    })
  })
})

describe('date filter round-trip', () => {
  const cases: DateFilter[] = [
    { type: 'preset', preset: '90d' },
    { type: 'preset', preset: 'ytd' },
    { type: 'preset', preset: '1y' },
    { type: 'preset', preset: 'last-year' },
    { type: 'preset', preset: '3y' },
    { type: 'none' },
    { type: 'year', year: 2024 },
    { type: 'range', startDate: '2024-06-10', endDate: '2024-06-20' },
  ]

  it.each(cases)('round-trips %o', (dateFilter) => {
    const params = encodeFilterParams(makeState(dateFilter))
    expect(decodeFilterParams(params).dateFilter).toEqual(dateFilter)
  })

  it.each(['90d', 'ytd'] as const)(
    'writes the former default %s to the URL explicitly',
    (preset) => {
      const params = encodeFilterParams(makeState({ type: 'preset', preset }))
      expect(params.get('date')).toBe(preset)
    }
  )
})

describe('severity with every box unchecked (#208)', () => {
  const emptyState = (): FilterState => ({
    ...makeState({ type: 'preset', preset: DEFAULT_DATE_PRESET }),
    severity: [],
    includeNoInjury: false,
  })

  it('encodes as an empty severity param', () => {
    expect(encodeFilterParams(emptyState()).get('severity')).toBe('')
  })

  it('round-trips to no severities instead of the defaults', () => {
    const decoded = decodeFilterParams(encodeFilterParams(emptyState()))
    expect(decoded.severity).toEqual([])
    expect(decoded.includeNoInjury).toBe(false)
  })

  it('still falls back to the defaults when every token is invalid', () => {
    const decoded = decodeFilterParams(new URLSearchParams('severity=bogus'))
    expect(decoded.severity).toEqual(DEFAULT_SEVERITY)
  })
})
