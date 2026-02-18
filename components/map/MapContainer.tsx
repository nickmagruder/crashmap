'use client'

import Map from 'react-map-gl/mapbox'

const DESKTOP_VIEW = { longitude: -120.5, latitude: 47.5, zoom: 7 }
const MOBILE_VIEW = { longitude: -122.3321, latitude: 47.6062, zoom: 11 }

export function MapContainer() {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const initialViewState = isMobile ? MOBILE_VIEW : DESKTOP_VIEW

  return (
    <Map
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={initialViewState}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/light-v11"
    />
  )
}
