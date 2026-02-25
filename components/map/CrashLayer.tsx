'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@apollo/client/react'
import { Source, Layer, useMap } from 'react-map-gl/mapbox'
import type { LayerProps } from 'react-map-gl/mapbox'
import type { FeatureCollection, Point } from 'geojson'
import { GET_CRASHES } from '@/lib/graphql/queries'
import { useFilterContext, toCrashFilter, type CrashFilterInput } from '@/context/FilterContext'
import { STANDARD_COLORS, ACCESSIBLE_COLORS } from '@/lib/crashColors'

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

const ALL_LAYER_IDS = ['crashes-none', 'crashes-minor', 'crashes-major', 'crashes-death']

export function CrashLayer() {
  const { current: map } = useMap()
  const { filterState, dispatch } = useFilterContext()

  // Reduce dot opacity by 10% on satellite to maintain visibility against imagery.
  const opacityOffset = filterState.satellite ? 0.15 : 0

  const colors = filterState.accessibleColors ? ACCESSIBLE_COLORS : STANDARD_COLORS

  // Layers are rendered bottom-to-top: None → Minor → Major → Death
  // so higher-severity dots always appear on top of lower-severity ones.
  const noneLayer: LayerProps = {
    id: 'crashes-none',
    type: 'circle',
    filter: ['==', ['get', 'severity'], 'None'],
    paint: {
      'circle-color': colors['None'],
      'circle-opacity': 0.5 + opacityOffset,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 1, 10, 5, 15, 9],
      'circle-stroke-width': 0,
    },
  }

  const minorLayer: LayerProps = {
    id: 'crashes-minor',
    type: 'circle',
    filter: ['==', ['get', 'severity'], 'Minor Injury'],
    paint: {
      'circle-color': colors['Minor Injury'],
      'circle-opacity': 0.55 + opacityOffset,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 1.5, 10, 6, 15, 12],
      'circle-stroke-width': 0,
    },
  }

  const majorLayer: LayerProps = {
    id: 'crashes-major',
    type: 'circle',
    filter: ['==', ['get', 'severity'], 'Major Injury'],
    paint: {
      'circle-color': colors['Major Injury'],
      'circle-opacity': 0.7 + opacityOffset,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2, 10, 7, 15, 15],
      'circle-stroke-width': 0,
    },
  }

  const deathLayer: LayerProps = {
    id: 'crashes-death',
    type: 'circle',
    filter: ['==', ['get', 'severity'], 'Death'],
    paint: {
      'circle-color': colors['Death'],
      'circle-opacity': 0.85 + opacityOffset,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2.5, 10, 8, 15, 18],
      'circle-stroke-width': 0,
    },
  }

  // Viewport bbox — only used when updateWithMovement is on.
  type BBox = NonNullable<CrashFilterInput['bbox']>
  const [bbox, setBbox] = useState<BBox | undefined>(undefined)

  // Two-ref pattern for geo-filter-triggered auto-zoom.
  // Effect 1 sets a pending flag when state/county/city changes.
  // Effect 2 executes the zoom once fresh data arrives.
  const prevGeoRef = useRef<{ state: string | null; county: string | null; city: string | null }>({
    state: null,
    county: null,
    city: null,
  })
  const zoomPendingRef = useRef(false)

  // Build the query filter: when updateWithMovement, use bbox and drop geo text fields.
  const queryFilter: CrashFilterInput = filterState.updateWithMovement
    ? {
        ...toCrashFilter(filterState),
        state: undefined,
        county: undefined,
        city: undefined,
        bbox: bbox ?? undefined,
      }
    : toCrashFilter(filterState)

  const noDateFilter = filterState.dateFilter.type === 'none'
  const presetWithoutBounds =
    filterState.dateFilter.type === 'preset' && filterState.dataBounds === null
  const skipQuery = noDateFilter || presetWithoutBounds

  const { data, previousData, error, loading } = useQuery<GetCrashesQuery>(GET_CRASHES, {
    variables: { filter: queryFilter, limit: 5000 },
    notifyOnNetworkStatusChange: true,
    skip: skipQuery,
  })

  // During a loading refetch, data is undefined (cache miss on new bbox/variables).
  // Fall back to previousData so the dots from the last result stay visible until
  // the new response arrives — prevents the flash-to-empty on every map move.
  // When no date filter is active or preset bounds not yet loaded, clear the map.
  const displayData = skipQuery ? undefined : (data ?? previousData)

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

  // When updateWithMovement is on: capture the current viewport and listen for moveend.
  // The bbox state drives a query re-run on each pan/zoom-end.
  useEffect(() => {
    if (!map || !filterState.updateWithMovement) return

    function captureBbox() {
      if (!map) return
      // Use unproject on canvas corners instead of getBounds() — getBounds() returns
      // the inner "unpadded" area when camera padding is active (e.g. after fitBounds).
      // Unprojecting pixel corners always gives the true full-canvas viewport bounds.
      const canvas = map.getCanvas()
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const sw = map.unproject([0, h])
      const ne = map.unproject([w, 0])
      // Add 5% buffer so crashes near the edge load before the user pans to them.
      const latBuf = (ne.lat - sw.lat) * 0.05
      const lngBuf = (ne.lng - sw.lng) * 0.05
      setBbox({
        minLat: sw.lat - latBuf,
        minLng: sw.lng - lngBuf,
        maxLat: ne.lat + latBuf,
        maxLng: ne.lng + lngBuf,
      })
    }

    // Seed with the current viewport immediately.
    captureBbox()
    map.on('moveend', captureBbox)
    return () => {
      map.off('moveend', captureBbox)
    }
  }, [map, filterState.updateWithMovement])

  // Effect 1: detect geographic filter changes and set pending zoom flag.
  // Skip auto-zoom when updateWithMovement is on (map position is user-driven).
  useEffect(() => {
    if (filterState.updateWithMovement) return
    const { state, county, city } = filterState
    const prev = prevGeoRef.current
    const changed = state !== prev.state || county !== prev.county || city !== prev.city
    if (!changed) return
    prevGeoRef.current = { state, county, city }
    zoomPendingRef.current = !!(state || county || city)
  }, [filterState.state, filterState.county, filterState.city, filterState.updateWithMovement]) // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 2: when fresh data arrives, execute a pending zoom to fit crash bounds.
  useEffect(() => {
    if (loading || !zoomPendingRef.current || !map || !displayData?.crashes?.items?.length) return

    const points = displayData.crashes.items.filter(
      (c) => c.latitude != null && c.longitude != null
    )
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
  }, [displayData, loading, map])

  if (error) {
    console.error('CrashLayer query error:', error)
    return null
  }

  if (!displayData) return null

  const geojson: FeatureCollection<Point> = {
    type: 'FeatureCollection',
    features: displayData.crashes.items
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
