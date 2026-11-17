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
  it('is YTD', () => {
    expect(DEFAULT_DATE_PRESET).toBe('ytd')
  })

  it('decodes a URL with no date params to the YTD preset', () => {
    expect(decodeFilterParams(new URLSearchParams()).dateFilter).toEqual({
      type: 'preset',
      preset: 'ytd',
    })
  })

  it('omits the YTD preset from the URL, so the default view has a clean URL', () => {
    const params = encodeFilterParams(makeState({ type: 'preset', preset: 'ytd' }))
    expect(params.has('date')).toBe(false)
    expect(params.toString()).toBe('')
  })

  it('falls back to YTD for an unknown preset', () => {
    expect(decodeFilterParams(new URLSearchParams('date=bogus')).dateFilter).toEqual({
      type: 'preset',
      preset: 'ytd',
    })
  })
})

describe('date filter round-trip', () => {
  const cases: DateFilter[] = [
    { type: 'preset', preset: 'ytd' },
    { type: 'preset', preset: '90d' },
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

  it('writes the former default (90d) to the URL explicitly', () => {
    const params = encodeFilterParams(makeState({ type: 'preset', preset: '90d' }))
    expect(params.get('date')).toBe('90d')
  })
})
