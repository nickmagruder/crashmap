import { describe, expect, it } from 'vitest'
import { hasNoSeverity, toCrashFilter, initialState } from '@/context/FilterContext'

describe('hasNoSeverity', () => {
  it('is true when every box, including None/Unknown, is unchecked', () => {
    expect(hasNoSeverity({ severity: [], includeNoInjury: false })).toBe(true)
  })

  it('is false when only None/Unknown is checked', () => {
    expect(hasNoSeverity({ severity: [], includeNoInjury: true })).toBe(false)
  })

  it('is false with the default severities', () => {
    expect(hasNoSeverity(initialState)).toBe(false)
  })
})

describe('toCrashFilter with no severities', () => {
  it('sends an empty severity list, which the API treats as matching nothing', () => {
    const filter = toCrashFilter({ ...initialState, severity: [], includeNoInjury: false })
    expect(filter.severity).toEqual([])
  })
})
