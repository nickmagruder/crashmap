import { describe, expect, it } from 'vitest'
import { getActiveFilterLabels, initialState, type FilterState } from '@/context/FilterContext'

const state = (overrides: Partial<FilterState> = {}): FilterState => ({
  ...initialState,
  ...overrides,
})

describe('getActiveFilterLabels', () => {
  describe('mode', () => {
    it('shows both mode emoji and reads "All modes" when no mode is chosen', () => {
      expect(getActiveFilterLabels(state())[0]).toEqual({
        icon: '🚲 🚶🏽‍♀️',
        srText: 'All modes',
      })
    })

    it('reads "Bicyclists" for the bicyclist mode', () => {
      expect(getActiveFilterLabels(state({ mode: 'Bicyclist' }))[0]).toEqual({
        icon: '🚲',
        srText: 'Bicyclists',
      })
    })

    it('reads "Pedestrians" for the pedestrian mode', () => {
      expect(getActiveFilterLabels(state({ mode: 'Pedestrian' }))[0]).toEqual({
        icon: '🚶🏽‍♀️',
        srText: 'Pedestrians',
      })
    })
  })

  it.each([
    [null, false],
    [null, true],
    ['Bicyclist', false],
    ['Bicyclist', true],
    ['Pedestrian', false],
    ['Pedestrian', true],
  ] as const)(
    'gives every badge something a screen reader can read (mode %s, follow map %s)',
    (mode, updateWithMovement) => {
      const labels = getActiveFilterLabels(
        state({
          mode,
          updateWithMovement,
          severity: ['Death'],
          includeNoInjury: true,
          county: 'King',
          city: 'Seattle',
        })
      )
      for (const label of labels) {
        expect(label.text ?? label.srText).toBeTruthy()
      }
    }
  )

  it('shows only the mode and date preset by default', () => {
    expect(getActiveFilterLabels(state())).toEqual([
      { icon: '🚲 🚶🏽‍♀️', srText: 'All modes' },
      { text: '1 Year' },
    ])
  })

  it('lists severities when they differ from the default', () => {
    const labels = getActiveFilterLabels(state({ severity: ['Death'], includeNoInjury: true }))
    expect(labels).toContainEqual({ text: 'Death + None' })
  })

  it('says "No severity" when every severity is unchecked', () => {
    expect(getActiveFilterLabels(state({ severity: [] }))).toContainEqual({ text: 'No severity' })
  })

  it('shows a custom date range', () => {
    const labels = getActiveFilterLabels(
      state({ dateFilter: { type: 'range', startDate: '2025-01-01', endDate: '2025-06-30' } })
    )
    expect(labels).toContainEqual({ text: '2025-01-01 – 2025-06-30' })
  })

  it('puts the viewport pin in icon and keeps "Viewport" as text', () => {
    const labels = getActiveFilterLabels(state({ updateWithMovement: true, county: 'King' }))
    expect(labels).toContainEqual({ icon: '📍', text: 'Viewport' })
    expect(labels).not.toContainEqual({ text: 'King' })
  })

  it('shows county and city when not following the map', () => {
    const labels = getActiveFilterLabels(state({ county: 'King', city: 'Seattle' }))
    expect(labels).toContainEqual({ text: 'King' })
    expect(labels).toContainEqual({ text: 'Seattle' })
  })
})
