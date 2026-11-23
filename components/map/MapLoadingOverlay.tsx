'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

/** How long a load must run before the overlay appears, so fast or cached responses don't flash it. */
const LOADING_OVERLAY_DELAY_MS = 300

/**
 * Effect body for `useDelayedFlag`, kept free of React so it can be tested with fake timers:
 * while `active`, calls `setShown(true)` after `delayMs`; the returned cleanup cancels the
 * timer and calls `setShown(false)`, so the flag drops as soon as `active` turns false.
 */
export function scheduleDelayedFlag(
  active: boolean,
  delayMs: number,
  setShown: (shown: boolean) => void
): (() => void) | undefined {
  if (!active) return
  const id = setTimeout(() => setShown(true), delayMs)
  return () => {
    clearTimeout(id)
    setShown(false)
  }
}

/** Returns true once `active` has stayed true for `delayMs`; returns false as soon as it turns false. */
function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => scheduleDelayedFlag(active, delayMs, setShown), [active, delayMs])
  return shown
}

/**
 * Presentational overlay: dims the map and centers a large spinner (no visible text).
 * The `role="status"` region always renders so screen readers announce the sr-only
 * "Loading crashes…" when it appears.
 * `pointer-events-none` keeps the map pannable and zoomable underneath.
 */
export function MapLoadingOverlayView({ visible }: { visible: boolean }) {
  return (
    <div role="status" aria-live="polite" className="pointer-events-none absolute inset-0 z-[1]">
      {visible && (
        <div className="flex h-full w-full items-center justify-center bg-black/25 dark:bg-black/45 animate-in fade-in duration-200 motion-reduce:animate-none">
          {/* Solid disc so the spinner keeps its contrast over light, dark and satellite maps */}
          <div className="rounded-full border bg-background/90 p-2 shadow-md">
            <Loader2
              className="size-12 text-foreground motion-safe:animate-spin"
              aria-hidden="true"
            />
          </div>
          <span className="sr-only">Loading crashes…</span>
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
