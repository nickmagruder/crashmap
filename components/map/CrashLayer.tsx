'use client'

import { useEffect, useRef } from 'react'
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
  jurisdiction: string | null
}

type GetCrashesQuery = {
  crashes: {
    items: CrashItem[]
    totalCount: number
  }
}

// Layers are rendered bottom-to-top: None → Minor → Major → Death
// so higher-severity dots always appear on top of lower-severity ones.
const noneLayer: LayerProps = {
  id: 'crashes-none',
  type: 'circle',
  filter: ['==', ['get', 'severity'], 'None'],
  paint: {
    'circle-color': '#C5E1A5',
    'circle-opacity': 0.5,
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 1, 10, 5, 15, 9],
    'circle-stroke-width': 0,
  },
}

const minorLayer: LayerProps = {
  id: 'crashes-minor',
  type: 'circle',
  filter: ['==', ['get', 'severity'], 'Minor Injury'],
  paint: {
    'circle-color': '#FDD835',
    'circle-opacity': 0.55,
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 1.5, 10, 6, 15, 12],
    'circle-stroke-width': 0,
  },
}

const majorLayer: LayerProps = {
  id: 'crashes-major',
  type: 'circle',
  filter: ['==', ['get', 'severity'], 'Major Injury'],
  paint: {
    'circle-color': '#F57C00',
    'circle-opacity': 0.7,
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2, 10, 7, 15, 15],
    'circle-stroke-width': 0,
  },
}

const deathLayer: LayerProps = {
  id: 'crashes-death',
  type: 'circle',
  filter: ['==', ['get', 'severity'], 'Death'],
  paint: {
    'circle-color': '#B71C1C',
    'circle-opacity': 0.85,
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2.5, 10, 8, 15, 18],
    'circle-stroke-width': 0,
  },
}

const ALL_LAYER_IDS = ['crashes-none', 'crashes-minor', 'crashes-major', 'crashes-death']

export function CrashLayer() {
  const { current: map } = useMap()
  const { filterState, dispatch } = useFilterContext()

  // Two-ref pattern for geo-filter-triggered auto-zoom.
  // Effect 1 sets a pending flag when state/county/city changes.
  // Effect 2 executes the zoom once fresh data arrives.
  const prevGeoRef = useRef<{ state: string | null; county: string | null; city: string | null }>({
    state: null,
    county: null,
    city: null,
  })
  const zoomPendingRef = useRef(false)
  const { data, error, loading } = useQuery<GetCrashesQuery>(GET_CRASHES, {
    variables: { filter: toCrashFilter(filterState), limit: 5000 },
    notifyOnNetworkStatusChange: true,
  })

  // Surface loading state so SummaryBar can show a refetch indicator.
  useEffect(() => {
    dispatch({ type: 'SET_LOADING', payload: loading })
  }, [loading, dispatch])

  // Surface the true total count to the filter context so SummaryBar can display it.
  useEffect(() => {
    if (!loading) {
      dispatch({ type: 'SET_TOTAL_COUNT', payload: data?.crashes.totalCount ?? null })
    }
  }, [data, loading, dispatch])

  useEffect(() => {
    if (!map) return
    const enter = () => {
      map.getCanvas().style.cursor = 'pointer'
    }
    const leave = () => {
      map.getCanvas().style.cursor = ''
    }
    for (const id of ALL_LAYER_IDS) {
      map.on('mouseenter', id, enter)
      map.on('mouseleave', id, leave)
    }
    return () => {
      for (const id of ALL_LAYER_IDS) {
        map.off('mouseenter', id, enter)
        map.off('mouseleave', id, leave)
      }
    }
  }, [map])

  // Effect 1: detect geographic filter changes and set pending zoom flag.
  useEffect(() => {
    const { state, county, city } = filterState
    const prev = prevGeoRef.current
    const changed = state !== prev.state || county !== prev.county || city !== prev.city
    if (!changed) return
    prevGeoRef.current = { state, county, city }
    zoomPendingRef.current = !!(state || county || city)
  }, [filterState.state, filterState.county, filterState.city]) // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 2: when fresh data arrives, execute a pending zoom to fit crash bounds.
  useEffect(() => {
    if (loading || !zoomPendingRef.current || !map || !data?.crashes?.items?.length) return

    const points = data.crashes.items.filter((c) => c.latitude != null && c.longitude != null)
    if (points.length === 0) return

    zoomPendingRef.current = false

    if (points.length === 1) {
      map.flyTo({ center: [points[0].longitude!, points[0].latitude!], zoom: 13, duration: 800 })
      return
    }

    let minLng = Infinity,
      maxLng = -Infinity
    let minLat = Infinity,
      maxLat = -Infinity
    for (const crash of points) {
      minLng = Math.min(minLng, crash.longitude!)
      maxLng = Math.max(maxLng, crash.longitude!)
      minLat = Math.min(minLat, crash.latitude!)
      maxLat = Math.max(maxLat, crash.latitude!)
    }

    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 80, duration: 800, maxZoom: 14 }
    )
  }, [data, loading, map])

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
          jurisdiction: crash.jurisdiction,
        },
      })),
  }

  return (
    <Source id="crashes" type="geojson" data={geojson}>
      <Layer {...noneLayer} />
      <Layer {...minorLayer} />
      <Layer {...majorLayer} />
      <Layer {...deathLayer} />
    </Source>
  )
}
