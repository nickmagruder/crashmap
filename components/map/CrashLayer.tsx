'use client'

import { useEffect } from 'react'
import { useQuery } from '@apollo/client/react'
import { Source, Layer, useMap } from 'react-map-gl/mapbox'
import type { LayerProps } from 'react-map-gl/mapbox'
import type { FeatureCollection, Point } from 'geojson'
import { GET_CRASHES } from '@/lib/graphql/queries'
import { useFilterContext, toCrashFilter } from '@/context/FilterContext'

type CrashItem = {
  colliRptNum: string
  latitude: number | null
  longitude: number | null
  severity: string | null
  injuryType: string | null
  mode: string | null
  crashDate: string | null
  time: string | null
  involvedPersons: number | null
  city: string | null
  county: string | null
}

type GetCrashesQuery = {
  crashes: {
    items: CrashItem[]
    totalCount: number
  }
}

const circleLayer: LayerProps = {
  id: 'crashes-circles',
  type: 'circle',
  paint: {
    // Color by severity bucket
    'circle-color': [
      'match',
      ['get', 'severity'],
      'Death',
      '#B71C1C',
      'Major Injury',
      '#F57C00',
      'Minor Injury',
      '#FDD835',
      'None',
      '#C5E1A5',
      '#999999',
    ],
    // Opacity by severity bucket
    'circle-opacity': [
      'match',
      ['get', 'severity'],
      'Death',
      0.85,
      'Major Injury',
      0.7,
      'Minor Injury',
      0.55,
      'None',
      0.5,
      0.65,
    ],
    // Radius scales with zoom; base sizes (at zoom 10) match the severity hierarchy
    'circle-radius': [
      'interpolate',
      ['linear'],
      ['zoom'],
      5,
      [
        'match',
        ['get', 'severity'],
        'Death',
        3,
        'Major Injury',
        2.5,
        'Minor Injury',
        2,
        'None',
        1.5,
        2,
      ],
      10,
      [
        'match',
        ['get', 'severity'],
        'Death',
        8,
        'Major Injury',
        7,
        'Minor Injury',
        6,
        'None',
        5,
        6,
      ],
      15,
      [
        'match',
        ['get', 'severity'],
        'Death',
        14,
        'Major Injury',
        12,
        'Minor Injury',
        10,
        'None',
        8,
        10,
      ],
    ],
    'circle-stroke-width': 0,
  },
}

export function CrashLayer() {
  const { current: map } = useMap()
  const { filterState, dispatch } = useFilterContext()
  const { data, error } = useQuery<GetCrashesQuery>(GET_CRASHES, {
    variables: { filter: toCrashFilter(filterState), limit: 5000 },
  })

  // Surface the true total count to the filter context so SummaryBar can display it.
  useEffect(() => {
    dispatch({ type: 'SET_TOTAL_COUNT', payload: data?.crashes.totalCount ?? null })
  }, [data, dispatch])

  useEffect(() => {
    if (!map) return
    const enter = () => {
      map.getCanvas().style.cursor = 'pointer'
    }
    const leave = () => {
      map.getCanvas().style.cursor = ''
    }
    map.on('mouseenter', 'crashes-circles', enter)
    map.on('mouseleave', 'crashes-circles', leave)
    return () => {
      map.off('mouseenter', 'crashes-circles', enter)
      map.off('mouseleave', 'crashes-circles', leave)
    }
  }, [map])

  if (error) {
    console.error('CrashLayer query error:', error)
    return null
  }

  if (!data) return null

  const geojson: FeatureCollection<Point> = {
    type: 'FeatureCollection',
    features: data.crashes.items
      .filter(
        (crash: { latitude: number | null; longitude: number | null }) =>
          crash.latitude != null && crash.longitude != null
      )
      .map((crash) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [crash.longitude!, crash.latitude!],
        },
        properties: {
          colliRptNum: crash.colliRptNum,
          severity: crash.severity,
          injuryType: crash.injuryType,
          mode: crash.mode,
          crashDate: crash.crashDate,
          time: crash.time,
          involvedPersons: crash.involvedPersons,
          city: crash.city,
          county: crash.county,
        },
      })),
  }

  return (
    <Source id="crashes" type="geojson" data={geojson}>
      <Layer {...circleLayer} />
    </Source>
  )
}
