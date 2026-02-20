'use client'

import { forwardRef, useState, useCallback } from 'react'
import Map, { Popup } from 'react-map-gl/mapbox'
import type { MapRef } from 'react-map-gl/mapbox'
import { useTheme } from 'next-themes'
import { Check, Copy } from 'lucide-react'
import { CrashLayer } from './CrashLayer'

const DESKTOP_VIEW = { longitude: -122.336, latitude: 47.6062, zoom: 10.5 }
const MOBILE_VIEW = { longitude: -122.336, latitude: 47.6062, zoom: 10.25 }

type SelectedCrash = {
  longitude: number
  latitude: number
  colliRptNum: string | null
  severity: string | null
  injuryType: string | null
  mode: string | null
  crashDate: string | null
  time: string | null
  involvedPersons: number | null
  city: string | null
  county: string | null
}

const SEVERITY_COLORS: Record<string, string> = {
  Death: '#B71C1C',
  'Major Injury': '#F57C00',
  'Minor Injury': '#FDD835',
  None: '#C5E1A5',
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export const MapContainer = forwardRef<MapRef>(function MapContainer(_, ref) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const initialViewState = isMobile ? MOBILE_VIEW : DESKTOP_VIEW

  const { resolvedTheme } = useTheme()
  const mapStyle =
    resolvedTheme === 'dark'
      ? 'mapbox://styles/mapbox/dark-v11'
      : 'mapbox://styles/mapbox/light-v11'

  const [selectedCrash, setSelectedCrash] = useState<SelectedCrash | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCopyReportNum = useCallback((num: string) => {
    navigator.clipboard.writeText(num)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  const handleMapClick = useCallback(
    (e: Parameters<NonNullable<React.ComponentProps<typeof Map>['onClick']>>[0]) => {
      const feature = e.features?.[0]
      if (!feature || feature.geometry.type !== 'Point') {
        setSelectedCrash(null)
        return
      }
      const coords = feature.geometry.coordinates as [number, number]
      const p = feature.properties as Record<string, string | number | null>
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
      })
    },
    []
  )

  return (
    <Map
      ref={ref}
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={initialViewState}
      style={{ width: '100%', height: '100%' }}
      mapStyle={mapStyle}
      interactiveLayerIds={['crashes-none', 'crashes-minor', 'crashes-major', 'crashes-death']}
      onClick={handleMapClick}
    >
      <CrashLayer />

      {selectedCrash && (
        <Popup
          longitude={selectedCrash.longitude}
          latitude={selectedCrash.latitude}
          onClose={() => setSelectedCrash(null)}
          closeButton
          closeOnClick={false}
          anchor="bottom"
          offset={10}
          maxWidth="220px"
        >
          <div className="px-1 py-1.5 text-[13px] leading-relaxed">
            {selectedCrash.crashDate && (
              <div className="mb-0.5 font-semibold">{formatDate(selectedCrash.crashDate)}</div>
            )}
            {selectedCrash.time && (
              <div className="mb-1" style={{ color: 'var(--muted-foreground)' }}>
                {selectedCrash.time}
              </div>
            )}
            {(selectedCrash.severity || selectedCrash.injuryType) && (
              <div className="flex items-center gap-1.5">
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: selectedCrash.severity
                      ? (SEVERITY_COLORS[selectedCrash.severity] ?? '#999')
                      : '#999',
                    flexShrink: 0,
                    border: '1px solid rgba(0,0,0,0.15)',
                  }}
                />
                {selectedCrash.injuryType ?? selectedCrash.severity}
              </div>
            )}
            {selectedCrash.mode && <div>{selectedCrash.mode}</div>}
            {(selectedCrash.city || selectedCrash.county) && (
              <div style={{ color: 'var(--muted-foreground)' }}>
                {[selectedCrash.city, selectedCrash.county].filter(Boolean).join(', ')}
              </div>
            )}
            {selectedCrash.involvedPersons != null && (
              <div style={{ color: 'var(--muted-foreground)' }}>
                {selectedCrash.involvedPersons} involved
              </div>
            )}
            {selectedCrash.colliRptNum && (
              <div
                className="mt-1 flex items-center gap-1 text-[11px]"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <span>
                  Report #:{' '}
                  <a
                    href="https://wrecr.wsp.wa.gov/wrecr/order"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--muted-foreground)', textDecoration: 'underline' }}
                  >
                    {selectedCrash.colliRptNum}
                  </a>
                </span>
                <button
                  onClick={() => handleCopyReportNum(selectedCrash.colliRptNum!)}
                  title="Copy report number"
                  style={{ color: 'var(--muted-foreground)', lineHeight: 1 }}
                >
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                </button>
              </div>
            )}
            <div className="mt-2 border-t pt-1.5" style={{ borderColor: 'var(--border)' }}>
              <a
                href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${selectedCrash.latitude},${selectedCrash.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px]"
                style={{ color: 'var(--primary)', textDecoration: 'underline' }}
              >
                Open Street View
              </a>
            </div>
          </div>
        </Popup>
      )}
    </Map>
  )
})
