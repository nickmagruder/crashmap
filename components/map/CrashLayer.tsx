'use client'

import { useQuery } from '@apollo/client/react'
import { Source, Layer } from 'react-map-gl/mapbox'
import type { LayerProps } from 'react-map-gl/mapbox'
import type { FeatureCollection, Point } from 'geojson'
import { GET_CRASHES } from '@/lib/graphql/queries'

type CrashItem = {
  colliRptNum: string
  latitude: number | null
  longitude: number | null
  severity: string | null
  mode: string | null
  crashDate: string | null
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
    'circle-radius': 5,
    'circle-color': '#B71C1C',
    'circle-opacity': 0.7,
  },
}

export function CrashLayer() {
  const { data, error } = useQuery<GetCrashesQuery>(GET_CRASHES, {
    variables: { limit: 5000 },
  })

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
          mode: crash.mode,
          crashDate: crash.crashDate,
        },
      })),
  }

  return (
    <Source id="crashes" type="geojson" data={geojson}>
      <Layer {...circleLayer} />
    </Source>
  )
}
