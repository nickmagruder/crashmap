'use client'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useFilterContext, type ModeFilter } from '@/context/FilterContext'

export function ModeToggle() {
  const { filterState, dispatch } = useFilterContext()

  const value = filterState.mode ?? 'all'

  function handleChange(newValue: string) {
    // Ignore deselection clicks (Radix fires "" when the active item is clicked again).
    if (!newValue) return
    dispatch({
      type: 'SET_MODE',
      payload: newValue === 'all' ? null : (newValue as ModeFilter),
    })
  }

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">Mode</p>
      <ToggleGroup type="single" variant="outline" value={value} onValueChange={handleChange}>
        <ToggleGroupItem value="all" aria-label="All modes">
          All
        </ToggleGroupItem>
        <ToggleGroupItem value="Bicyclist" aria-label="Bicyclists only">
          Bicyclist
        </ToggleGroupItem>
        <ToggleGroupItem value="Pedestrian" aria-label="Pedestrians only">
          Pedestrian
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}
