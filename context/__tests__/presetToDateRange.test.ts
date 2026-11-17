import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { presetToDateRange } from '@/context/FilterContext'

const bounds = (maxDate: string) => ({ minDate: '2015-01-01', maxDate })

describe('presetToDateRange', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('ytd', () => {
    it('runs from January 1 of the newest crash year to the newest crash', () => {
      vi.setSystemTime(new Date(2026, 10, 17)) // 2026-11-17 local
      expect(presetToDateRange('ytd', bounds('2026-11-12'))).toEqual({
        startDate: '2026-01-01',
        endDate: '2026-11-12',
      })
    })

    it('stays on the data year in January, before new-year data is imported', () => {
      vi.setSystemTime(new Date(2027, 0, 5)) // 2027-01-05 local; newest crash is still 2026
      const { startDate, endDate } = presetToDateRange('ytd', bounds('2026-12-20'))
      expect(startDate).toBe('2026-01-01')
      expect(endDate).toBe('2026-12-20')
      expect(startDate <= endDate).toBe(true)
    })
  })

  it('90d ends at the newest crash', () => {
    vi.setSystemTime(new Date(2026, 10, 17))
    expect(presetToDateRange('90d', bounds('2026-11-12'))).toEqual({
      startDate: '2026-08-14',
      endDate: '2026-11-12',
    })
  })

  it('last-year spans the previous calendar year', () => {
    vi.setSystemTime(new Date(2026, 10, 17))
    expect(presetToDateRange('last-year', bounds('2026-11-12'))).toEqual({
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    })
  })

  it('3y covers the 36 months ending at the newest crash', () => {
    vi.setSystemTime(new Date(2026, 10, 17))
    expect(presetToDateRange('3y', bounds('2026-11-12'))).toEqual({
      startDate: '2023-11-12',
      endDate: '2026-11-12',
    })
  })
})
