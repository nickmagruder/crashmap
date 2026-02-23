'use client'

import { useQuery } from '@apollo/client/react'
import { Loader2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useFilterContext } from '@/context/FilterContext'
import {
  GET_COUNTIES,
  GET_CITIES,
  type GetCountiesQuery,
  type GetCitiesQuery,
} from '@/lib/graphql/queries'

// Sentinel value used instead of empty string (shadcn Select doesn't support null values).
const ALL = '__all__'

// Washington is the only state in the dataset — hardcode it for all county/city queries.
const WASHINGTON = 'Washington'

export function GeographicFilter() {
  const { filterState, dispatch } = useFilterContext()

  // Always load all counties for Washington (no state selector in UI).
  const { data: countiesData, loading: countiesLoading } = useQuery<GetCountiesQuery>(
    GET_COUNTIES,
    { variables: { state: WASHINGTON } }
  )

  // Always load all cities for Washington — decoupled from county selection.
  const { data: citiesData, loading: citiesLoading } = useQuery<GetCitiesQuery>(GET_CITIES, {
    variables: { state: WASHINGTON },
  })

  const counties = countiesData?.filterOptions?.counties ?? []
  const cities = citiesData?.filterOptions?.cities ?? []

  const isDisabled = filterState.updateWithMovement

  function handleCountyChange(value: string) {
    dispatch({ type: 'SET_COUNTY', payload: value === ALL ? null : value })
  }

  function handleCityChange(value: string) {
    dispatch({ type: 'SET_CITY', payload: value === ALL ? null : value })
  }

  function handleMovementToggle(checked: boolean) {
    dispatch({ type: 'SET_UPDATE_WITH_MOVEMENT', payload: checked })
  }

  function handleSatelliteToggle(checked: boolean) {
    dispatch({ type: 'SET_SATELLITE', payload: checked })
  }

  if (countiesLoading && citiesLoading && !countiesData && !citiesData) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Location</p>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Location selectors */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium">Location</p>
          {(countiesLoading || citiesLoading) && (
            <Loader2 className="size-3 animate-spin text-muted-foreground" aria-label="Loading" />
          )}
        </div>

        <Select
          value={filterState.county ?? ALL}
          onValueChange={handleCountyChange}
          disabled={isDisabled || counties.length === 0}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All counties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All counties</SelectItem>
            {counties.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterState.city ?? ALL}
          onValueChange={handleCityChange}
          disabled={isDisabled || cities.length === 0}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All cities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All cities</SelectItem>
            {cities.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Map Controls */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Map Controls</p>
        <div className="flex items-center gap-2">
          <Switch
            id="update-with-movement"
            checked={filterState.updateWithMovement}
            onCheckedChange={handleMovementToggle}
          />
          <Label htmlFor="update-with-movement" className="text-sm cursor-pointer">
            Update search as map moves
          </Label>
        </div>
        {filterState.updateWithMovement && (
          <p className="text-xs text-muted-foreground">
            Showing crashes within the current viewport. Pan or zoom to update results.
          </p>
        )}
        <div className="flex items-center gap-2">
          <Switch
            id="satellite-view"
            checked={filterState.satellite}
            onCheckedChange={handleSatelliteToggle}
          />
          <Label htmlFor="satellite-view" className="text-sm cursor-pointer">
            Satellite view
          </Label>
        </div>
      </div>
    </div>
  )
}
