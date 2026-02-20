'use client'

import { useRef, useEffect, useState } from 'react'
import { Loader2, SlidersHorizontal } from 'lucide-react'
import type { MapRef } from 'react-map-gl/mapbox'
import { MapContainer } from '@/components/map/MapContainer'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { FilterOverlay } from '@/components/overlay/FilterOverlay'
import { SummaryBar } from '@/components/summary/SummaryBar'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { useFilterContext, getActiveFilterLabels } from '@/context/FilterContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const mapFallback = (
  <div className="flex h-full w-full items-center justify-center bg-background">
    <div className="space-y-3 text-center">
      <p className="text-sm text-muted-foreground">Map failed to load.</p>
      <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
        Refresh
      </Button>
    </div>
  </div>
)

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const mapRef = useRef<MapRef>(null)
  const { filterState } = useFilterContext()

  // Call resize() after sidebar/overlay transitions so Mapbox recomputes canvas size.
  // 300ms matches the shadcn Sheet slide animation duration.
  useEffect(() => {
    const id = setTimeout(() => mapRef.current?.resize(), 300)
    return () => clearTimeout(id)
  }, [sidebarOpen, overlayOpen])

  return (
    <>
      <ErrorBoundary fallback={mapFallback}>
        <MapContainer ref={mapRef} />
      </ErrorBoundary>

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
            {filterState.isLoading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <SlidersHorizontal className="size-4" suppressHydrationWarning />
            )}
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
            {filterState.isLoading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <SlidersHorizontal className="size-4" suppressHydrationWarning />
            )}
          </Button>
        </div>
      </div>

      <SummaryBar
        crashCount={filterState.totalCount}
        activeFilters={getActiveFilterLabels(filterState)}
        isLoading={filterState.isLoading}
      />

      <ErrorBoundary fallback={null}>
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <FilterOverlay isOpen={overlayOpen} onClose={() => setOverlayOpen(false)} />
      </ErrorBoundary>
    </>
  )
}
