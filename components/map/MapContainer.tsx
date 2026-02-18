'use client'

import { forwardRef } from 'react'
import Map from 'react-map-gl/mapbox'
import type { MapRef } from 'react-map-gl/mapbox'

export const MapContainer = forwardRef<MapRef>(function MapContainer(_, ref) {
  return (
    <Map
      ref={ref}
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={{ longitude: -120.5, latitude: 47.5, zoom: 7 }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/light-v11"
    />
  )
})
