import { useRef } from 'react';

import MapProvider from '../mapbox/MapBoxProvider';
import MapStyles from '../components/map-styles';
import MapControls from '../components/map-controls';
import MapSearch from '../components/map-styles';

function Map() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="w-screen h-screen">
      <div
        id="map-container"
        ref={mapContainerRef}
        className="absolute inset-0 h-full w-full"
      />

      <MapProvider
        mapContainerRef={mapContainerRef}
        initialViewState={{
          longitude: -122.4194,
          latitude: 37.7749,
          zoom: 10
        }}
      >
        <MapSearch />
        <MapControls />
        <MapStyles />
      </MapProvider>
    </div>
  );
}

export default Map;
