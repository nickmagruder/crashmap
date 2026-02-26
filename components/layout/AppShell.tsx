'use client'

import { useRef, useEffect, useState } from 'react'
import { Box, Eye, Heart, Info, Loader2, Minus, Plus, SlidersHorizontal } from 'lucide-react'
import type { MapRef } from 'react-map-gl/mapbox'
import { MapContainer } from '@/components/map/MapContainer'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { FilterOverlay } from '@/components/overlay/FilterOverlay'
import { InfoSidePanel, type InfoPanelView } from '@/components/info/InfoSidePanel'
import { InfoOverlay } from '@/components/info/InfoOverlay'
import { SummaryBar } from '@/components/summary/SummaryBar'
import { ExportButton } from '@/components/export/ExportButton'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { useFilterContext, getActiveFilterLabels } from '@/context/FilterContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { toast } from 'sonner'

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
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [infoPanelOpen, setInfoPanelOpen] = useState(true)
  const [infoOverlayOpen, setInfoOverlayOpen] = useState(false)
  const [infoPanelView, setInfoPanelView] = useState<InfoPanelView>('info')
  const [tilted, setTilted] = useState(false)
  const mapRef = useRef<MapRef>(null)
  const { filterState, dispatch } = useFilterContext()

  // Call resize() after any panel transition so Mapbox recomputes canvas size.
  useEffect(() => {
    const id = setTimeout(() => mapRef.current?.resize(), 0)
    return () => clearTimeout(id)
  }, [sidebarOpen, overlayOpen, infoPanelOpen, infoOverlayOpen])

  // Warn if no dates are selected, since that can be confusing. Dismiss when they do select some.
  useEffect(() => {
    if (filterState.dateFilter.type === 'none') {
      toast.warning('No dates selected — use the filters to select a date range', {
        id: 'no-dates-selected',
        duration: Infinity,
      })
    } else {
      toast.dismiss('no-dates-selected')
    }
  }, [filterState.dateFilter.type])

  return (
    <div className="flex w-full h-full">
      {/* Left: info panel (desktop, pinned) */}
      {infoPanelOpen && (
        <InfoSidePanel
          onClose={() => setInfoPanelOpen(false)}
          view={infoPanelView}
          onSwitchView={setInfoPanelView}
        />
      )}

      {/* Center: map + overlays + controls */}
      <div className="flex-1 relative" style={{ minWidth: 0 }}>
        <ErrorBoundary fallback={mapFallback}>
          <MapContainer ref={mapRef} />
        </ErrorBoundary>

        {/* Top-left: info/about toggle + support */}
        <div className="absolute top-4 left-4 z-10 flex gap-2">
          {/* Desktop version */}
          <div className="hidden md:flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="dark:bg-zinc-900 dark:border-zinc-700"
              onClick={() => {
                setInfoPanelView('info')
                setInfoPanelOpen(true)
              }}
              aria-label="Open about panel"
            >
              <Info className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="dark:bg-zinc-900 dark:border-zinc-700"
              onClick={() => {
                setInfoPanelView('support')
                setInfoPanelOpen(true)
              }}
              aria-label="Support this app"
            >
              <Heart className="size-4" />
            </Button>
          </div>
          {/* Mobile version */}
          <div className="md:hidden flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="dark:bg-zinc-900 dark:border-zinc-700"
              onClick={() => {
                setInfoPanelView('info')
                setInfoOverlayOpen(true)
              }}
              aria-label="Open about"
            >
              <Info className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="dark:bg-zinc-900 dark:border-zinc-700"
              onClick={() => {
                setInfoPanelView('support')
                setInfoOverlayOpen(true)
              }}
              aria-label="Support this app"
            >
              <Heart className="size-4" />
            </Button>
          </div>
        </div>

        {/* Top-right controls */}
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <Button
            variant={filterState.accessibleColors ? 'default' : 'outline'}
            size="icon"
            className={filterState.accessibleColors ? '' : 'dark:bg-zinc-900 dark:border-zinc-700'}
            onClick={() =>
              dispatch({
                type: 'SET_ACCESSIBLE_COLORS',
                payload: !filterState.accessibleColors,
              })
            }
            aria-label={
              filterState.accessibleColors
                ? 'Disable accessible colors'
                : 'Enable accessible colors'
            }
            title={
              filterState.accessibleColors
                ? 'Disable accessible colors'
                : 'Enable accessible colors'
            }
          >
            <Eye className="size-4" />
          </Button>
          <ThemeToggle className="dark:bg-zinc-900 dark:border-zinc-700" />
          {/* Sidebar toggle — desktop only */}
          <div className="hidden md:block">
            <Button
              variant="outline"
              size="icon"
              className="dark:bg-zinc-900 dark:border-zinc-700"
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
              className="dark:bg-zinc-900 dark:border-zinc-700"
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

        {/* Bottom-left: tilt + zoom controls */}
        <div className="absolute bottom-14 left-4 z-10 flex flex-col gap-2 md:bottom-6">
          <Button
            variant={tilted ? 'default' : 'outline'}
            size="icon"
            className={tilted ? '' : 'dark:bg-zinc-900 dark:border-zinc-700'}
            onClick={() => {
              const map = mapRef.current?.getMap()
              if (!map) return
              const isTilted = map.getPitch() > 0
              map.easeTo({ pitch: isTilted ? 0 : 45, duration: 1000 })
              setTilted(!isTilted)
            }}
            aria-label={tilted ? 'Reset to flat view' : 'Tilt map to 3D view'}
            title={tilted ? 'Reset to flat view' : 'Tilt map to 3D view'}
          >
            <Box className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="dark:bg-zinc-900 dark:border-zinc-700"
            onClick={() => mapRef.current?.getMap()?.zoomIn()}
            aria-label="Zoom in"
          >
            <Plus className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="dark:bg-zinc-900 dark:border-zinc-700"
            onClick={() => mapRef.current?.getMap()?.zoomOut()}
            aria-label="Zoom out"
          >
            <Minus className="size-4" />
          </Button>
        </div>

        <SummaryBar
          activeFilters={getActiveFilterLabels(filterState)}
          isLoading={filterState.isLoading}
          actions={<ExportButton variant="icon" />}
        />

        <ErrorBoundary fallback={null}>
          {/* Mobile overlays */}
          <FilterOverlay isOpen={overlayOpen} onClose={() => setOverlayOpen(false)} />
          <InfoOverlay
            isOpen={infoOverlayOpen}
            onClose={() => setInfoOverlayOpen(false)}
            view={infoPanelView}
            onSwitchView={setInfoPanelView}
          />
        </ErrorBoundary>
      </div>

      {/* Right: filter panel (desktop, pinned) */}
      {sidebarOpen && <Sidebar onClose={() => setSidebarOpen(false)} />}
    </div>
  )
}
