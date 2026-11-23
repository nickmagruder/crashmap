'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

/** How long a load must run before the overlay appears, so fast or cached responses don't flash it. */
const LOADING_OVERLAY_DELAY_MS = 300

/** Returns true once `active` has stayed true for `delayMs`; returns false as soon as it turns false. */
function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!active) return
    const id = setTimeout(() => setShown(true), delayMs)
    // Hide as soon as loading ends (or the delay is cancelled).
    return () => {
      clearTimeout(id)
      setShown(false)
    }
  }, [active, delayMs])
  return shown
}

/**
 * Presentational overlay: dims the map and centers a large spinner with "Loading crashes…".
 * The `role="status"` region always renders so screen readers announce the text when it appears.
 * `pointer-events-none` keeps the map pannable and zoomable underneath.
 */
export function MapLoadingOverlayView({ visible }: { visible: boolean }) {
  return (
    <div role="status" aria-live="polite" className="pointer-events-none absolute inset-0 z-[1]">
      {visible && (
        <div className="flex h-full w-full items-center justify-center bg-black/25 dark:bg-black/45 animate-in fade-in duration-200 motion-reduce:animate-none">
          <div className="flex flex-col items-center gap-3">
            <Loader2
              className="size-12 text-white drop-shadow-md motion-safe:animate-spin"
              aria-hidden="true"
            />
            <span className="rounded-md border bg-background/90 px-3 py-1 text-sm font-medium shadow-md backdrop-blur-sm">
              Loading crashes…
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Centered loading overlay for the map area, shown after a short delay while crashes load. */
export function MapLoadingOverlay({ isLoading }: { isLoading: boolean }) {
  const visible = useDelayedFlag(isLoading, LOADING_OVERLAY_DELAY_MS)
  return <MapLoadingOverlayView visible={visible} />
}
