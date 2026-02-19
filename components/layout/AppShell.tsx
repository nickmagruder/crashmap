'use client'

import { useRef, useEffect, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import type { MapRef } from 'react-map-gl/mapbox'
import { MapContainer } from '@/components/map/MapContainer'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { FilterOverlay } from '@/components/overlay/FilterOverlay'
import { SummaryBar } from '@/components/summary/SummaryBar'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const mapRef = useRef<MapRef>(null)

  // Call resize() after sidebar/overlay transitions so Mapbox recomputes canvas size.
  // 300ms matches the shadcn Sheet slide animation duration.
  useEffect(() => {
    const id = setTimeout(() => mapRef.current?.resize(), 300)
    return () => clearTimeout(id)
  }, [sidebarOpen, overlayOpen])

  return (
    <>
      <MapContainer ref={mapRef} />

      {/* Top-right controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <ThemeToggle />
        {/* Sidebar toggle — desktop only */}
        <div className="hidden md:block">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open filters"
          >
            <SlidersHorizontal className="size-4" />
          </Button>
        </div>
        {/* Filter overlay toggle — mobile only */}
        <div className="md:hidden">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setOverlayOpen(true)}
            aria-label="Open filters"
          >
            <SlidersHorizontal className="size-4" />
          </Button>
        </div>
      </div>

      <SummaryBar />

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <FilterOverlay isOpen={overlayOpen} onClose={() => setOverlayOpen(false)} />
    </>
  )
}
