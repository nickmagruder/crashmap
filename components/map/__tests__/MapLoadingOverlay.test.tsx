import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  MapLoadingOverlay,
  MapLoadingOverlayView,
  scheduleDelayedFlag,
} from '@/components/map/MapLoadingOverlay'

const renderView = (visible: boolean) =>
  renderToStaticMarkup(<MapLoadingOverlayView visible={visible} />)

describe('MapLoadingOverlayView', () => {
  it('puts the spinner on a solid disc so it keeps contrast over any basemap', () => {
    expect(renderView(true)).toMatch(/<div class="rounded-full border bg-background\/90[^"]*"><svg/)
  })

  it('dims the map and centers a large spinner with no visible text', () => {
    const html = renderView(true)
    expect(html).toContain('bg-black/25')
    expect(html).toMatch(/<svg[^>]*class="[^"]*size-12[^"]*"/)
    expect(html).toContain('<span class="sr-only">Loading crashes…</span>')
    expect(html.match(/Loading crashes…/g)).toHaveLength(1)
  })

  it('stops the spinner under reduced motion', () => {
    const html = renderView(true)
    expect(html).toContain('motion-safe:animate-spin')
    expect(html).not.toMatch(/[" ]animate-spin/)
  })

  it('hides the spinner icon from screen readers and announces sr-only text in a status region', () => {
    const html = renderView(true)
    expect(html).toMatch(/^<div role="status" aria-live="polite"/)
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/)
    expect(html).toContain('<span class="sr-only">Loading crashes…</span>')
  })

  it('never blocks map panning or zooming', () => {
    expect(renderView(true)).toMatch(/^<div[^>]*class="pointer-events-none /)
  })

  it('keeps the empty status region rendered when hidden, so the later text is announced', () => {
    const html = renderView(false)
    expect(html).toMatch(/^<div role="status" aria-live="polite"[^>]*><\/div>$/)
    expect(html).not.toContain('Loading crashes…')
  })
})

describe('scheduleDelayedFlag', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the flag only once loading has lasted the full delay', () => {
    const setShown = vi.fn()
    scheduleDelayedFlag(true, 300, setShown)
    vi.advanceTimersByTime(299)
    expect(setShown).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(setShown).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('never shows the flag when loading ends before the delay', () => {
    const setShown = vi.fn()
    const cleanup = scheduleDelayedFlag(true, 300, setShown)
    vi.advanceTimersByTime(200)
    cleanup?.()
    vi.advanceTimersByTime(1000)
    expect(setShown).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('hides the flag as soon as loading ends after it was shown', () => {
    const setShown = vi.fn()
    const cleanup = scheduleDelayedFlag(true, 300, setShown)
    vi.advanceTimersByTime(300)
    cleanup?.()
    expect(setShown.mock.calls).toEqual([[true], [false]])
  })

  it('restarts the full delay after a rapid stop and start', () => {
    const setShown = vi.fn()
    scheduleDelayedFlag(true, 300, setShown)?.()
    scheduleDelayedFlag(true, 300, setShown)
    vi.advanceTimersByTime(299)
    expect(setShown).not.toHaveBeenCalledWith(true)
    vi.advanceTimersByTime(1)
    expect(setShown).toHaveBeenLastCalledWith(true)
  })

  it('does nothing while not loading', () => {
    const setShown = vi.fn()
    expect(scheduleDelayedFlag(false, 300, setShown)).toBeUndefined()
    vi.advanceTimersByTime(1000)
    expect(setShown).not.toHaveBeenCalled()
  })
})

describe('MapLoadingOverlay', () => {
  it('shows nothing on first render even while loading, so fast responses never flash it', () => {
    expect(renderToStaticMarkup(<MapLoadingOverlay isLoading />)).not.toContain('Loading crashes…')
  })
})
