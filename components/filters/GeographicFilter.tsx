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
import { useFilterContext } from '@/context/FilterContext'
import {
  GET_FILTER_OPTIONS,
  GET_COUNTIES,
  GET_CITIES,
  type GetFilterOptionsQuery,
  type GetCountiesQuery,
  type GetCitiesQuery,
} from '@/lib/graphql/queries'

// Sentinel value used instead of empty string (shadcn Select doesn't support null values).
const ALL = '__all__'

export function GeographicFilter() {
  const { filterState, dispatch } = useFilterContext()

  const { data: optionsData } = useQuery<GetFilterOptionsQuery>(GET_FILTER_OPTIONS)

  const { data: countiesData, loading: countiesLoading } = useQuery<GetCountiesQuery>(
    GET_COUNTIES,
    {
      variables: { state: filterState.state },
      skip: !filterState.state,
    }
  )

  const { data: citiesData, loading: citiesLoading } = useQuery<GetCitiesQuery>(GET_CITIES, {
    variables: { state: filterState.state, county: filterState.county },
    skip: !filterState.county,
  })

  const states = optionsData?.filterOptions?.states ?? []
  const counties = countiesData?.filterOptions?.counties ?? []
  const cities = citiesData?.filterOptions?.cities ?? []

  function handleStateChange(value: string) {
    dispatch({ type: 'SET_STATE', payload: value === ALL ? null : value })
  }

  function handleCountyChange(value: string) {
    dispatch({ type: 'SET_COUNTY', payload: value === ALL ? null : value })
  }

  function handleCityChange(value: string) {
    dispatch({ type: 'SET_CITY', payload: value === ALL ? null : value })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-medium">Location</p>
        {(countiesLoading || citiesLoading) && (
          <Loader2 className="size-3 animate-spin text-muted-foreground" aria-label="Loading" />
        )}
      </div>

      <Select value={filterState.state ?? ALL} onValueChange={handleStateChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="All states" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All states</SelectItem>
          {states.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filterState.county ?? ALL}
        onValueChange={handleCountyChange}
        disabled={!filterState.state || counties.length === 0}
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
        disabled={!filterState.county || cities.length === 0}
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
  )
}
