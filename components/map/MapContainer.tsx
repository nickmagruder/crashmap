'use client'

import { forwardRef, useState, useCallback, useRef, useImperativeHandle } from 'react'
import Map from 'react-map-gl/mapbox'
import type { MapRef } from 'react-map-gl/mapbox'
import { useTheme } from 'next-themes'
import { CrashLayer } from './CrashLayer'
import { CrashPopup } from './CrashPopup'
import type { SelectedCrash } from './CrashPopup'
import { useFilterContext } from '@/context/FilterContext'

type SavedViewport = {
  center: [number, number]
  zoom: number
  bearing: number
  pitch: number
}

const DESKTOP_VIEW = { longitude: -122.336, latitude: 47.6062, zoom: 10.5 }
const MOBILE_VIEW = { longitude: -122.336, latitude: 47.6062, zoom: 10.25 }

export const MapContainer = forwardRef<MapRef>(function MapContainer(_, ref) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const initialViewState = isMobile ? MOBILE_VIEW : DESKTOP_VIEW

  const { resolvedTheme } = useTheme()
  const { filterState } = useFilterContext()
  const mapStyle = filterState.satellite
    ? 'mapbox://styles/mapbox/satellite-streets-v12'
    : resolvedTheme === 'dark'
      ? 'mapbox://styles/mapbox/dark-v11'
      : 'mapbox://styles/mapbox/light-v11'

  // Internal ref for viewport capture/restore; forwarded externally for map.resize()
  const internalMapRef = useRef<MapRef>(null)
  useImperativeHandle(ref, () => internalMapRef.current!)

  const savedViewportRef = useRef<SavedViewport | null>(null)

  const [selectedCrash, setSelectedCrash] = useState<SelectedCrash | null>(null)

  const closePopup = useCallback(() => {
    setSelectedCrash(null)
    const saved = savedViewportRef.current
    if (saved && internalMapRef.current) {
      internalMapRef.current.getMap()?.flyTo({
        center: saved.center,
        zoom: saved.zoom,
        bearing: saved.bearing,
        pitch: saved.pitch,
        duration: 800,
        essential: true,
      })
      savedViewportRef.current = null
    }
  }, [])

  const handleMapClick = useCallback(
    (e: Parameters<NonNullable<React.ComponentProps<typeof Map>['onClick']>>[0]) => {
      const feature = e.features?.[0]
      if (!feature || feature.geometry.type !== 'Point') {
        closePopup()
        return
      }
      const coords = feature.geometry.coordinates as [number, number]
      const p = feature.properties as Record<string, string | number | null>

      const map = internalMapRef.current?.getMap()
      // Save viewport only once — clicking crash-to-crash keeps the original
      if (map && !savedViewportRef.current) {
        const center = map.getCenter()
        savedViewportRef.current = {
          center: [center.lng, center.lat],
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch(),
        }
      }

      setSelectedCrash({
        longitude: coords[0],
        latitude: coords[1],
        colliRptNum: p.colliRptNum as string | null,
        severity: p.severity as string | null,
        injuryType: p.injuryType as string | null,
        mode: p.mode as string | null,
        crashDate: p.crashDate as string | null,
        time: p.time as string | null,
        involvedPersons: p.involvedPersons as number | null,
        city: p.city as string | null,
        county: p.county as string | null,
        jurisdiction: p.jurisdiction as string | null,
      })

      map?.flyTo({
        center: coords,
        zoom: 15.5,
        pitch: 45,
        duration: 800,
        essential: true,
      })
    },
    [closePopup]
  )

  return (
    <Map
      ref={internalMapRef}
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={initialViewState}
      style={{ width: '100%', height: '100%' }}
      mapStyle={mapStyle}
      interactiveLayerIds={['crashes-none', 'crashes-minor', 'crashes-major', 'crashes-death']}
      onClick={handleMapClick}
    >
      <CrashLayer />
      {selectedCrash && <CrashPopup crash={selectedCrash} onClose={closePopup} />}
    </Map>
  )
})
