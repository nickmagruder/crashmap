'use client'

import Map from 'react-map-gl/mapbox'

export function MapContainer() {
  return (
    <Map
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={{ longitude: -120.5, latitude: 47.5, zoom: 7 }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/light-v11"
    />
  )
}
