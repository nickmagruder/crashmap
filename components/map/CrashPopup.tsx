'use client'

import { useState, useCallback } from 'react'
import { Popup } from 'react-map-gl/mapbox'
import { Check, Copy } from 'lucide-react'

export type SelectedCrash = {
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
  jurisdiction: string | null
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

type CrashPopupProps = {
  crash: SelectedCrash
  onClose: () => void
}

export function CrashPopup({ crash, onClose }: CrashPopupProps) {
  const [copied, setCopied] = useState(false)

  const handleCopyReportNum = useCallback((num: string) => {
    navigator.clipboard.writeText(num)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  return (
    <Popup
      longitude={crash.longitude}
      latitude={crash.latitude}
      onClose={onClose}
      closeButton
      closeOnClick={false}
      anchor="bottom"
      offset={10}
      maxWidth="220px"
    >
      <div className="px-1 py-1.5 text-[13px] leading-relaxed">
        {crash.crashDate && (
          <div className="mb-0.5 font-semibold">{formatDate(crash.crashDate)}</div>
        )}
        {crash.time && (
          <div className="mb-1" style={{ color: 'var(--muted-foreground)' }}>
            {crash.time}
          </div>
        )}
        {(crash.severity || crash.injuryType) && (
          <div className="flex items-center gap-1.5">
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: crash.severity
                  ? (SEVERITY_COLORS[crash.severity] ?? '#999')
                  : '#999',
                flexShrink: 0,
                border: '1px solid rgba(0,0,0,0.15)',
              }}
            />
            {crash.injuryType ?? crash.severity}
          </div>
        )}
        {crash.mode && <div>{crash.mode}</div>}
        {(crash.city || crash.county) && (
          <div style={{ color: 'var(--muted-foreground)' }}>
            {[crash.city, crash.county].filter(Boolean).join(', ')}
          </div>
        )}
        {crash.jurisdiction && (
          <div style={{ color: 'var(--muted-foreground)' }}>{crash.jurisdiction}</div>
        )}
        {crash.involvedPersons != null && (
          <div style={{ color: 'var(--muted-foreground)' }}>{crash.involvedPersons} involved</div>
        )}
        {crash.colliRptNum && (
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
                {crash.colliRptNum}
              </a>
            </span>
            <button
              onClick={() => handleCopyReportNum(crash.colliRptNum!)}
              title="Copy report number"
              style={{ color: 'var(--muted-foreground)', lineHeight: 1 }}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
            </button>
          </div>
        )}
        <div
          className="mt-2 border-t pt-1.5 flex flex-col gap-1"
          style={{ borderColor: 'var(--border)' }}
        >
          <a
            href={`https://maps.apple.com/?ll=${crash.latitude},${crash.longitude}&z=20`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px]"
            style={{ color: 'var(--primary)', textDecoration: 'underline' }}
          >
            Open in Apple Maps
          </a>
          <a
            href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${crash.latitude},${crash.longitude}`}
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
  )
}
