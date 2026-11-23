import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapLoadingOverlay, MapLoadingOverlayView } from '@/components/map/MapLoadingOverlay'

const renderView = (visible: boolean) =>
  renderToStaticMarkup(<MapLoadingOverlayView visible={visible} />)

describe('MapLoadingOverlayView', () => {
  it('dims the map and centers a large spinner with visible loading text', () => {
    const html = renderView(true)
    expect(html).toContain('bg-black/25')
    expect(html).toContain('Loading crashes…')
    expect(html).toMatch(/<svg[^>]*class="[^"]*size-12[^"]*"/)
  })

  it('stops the spinner under reduced motion but keeps the text', () => {
    const html = renderView(true)
    expect(html).toContain('motion-safe:animate-spin')
    expect(html).not.toMatch(/[" ]animate-spin/)
    expect(html).toContain('Loading crashes…')
  })

  it('hides the spinner icon from screen readers and announces the text in a status region', () => {
    const html = renderView(true)
    expect(html).toMatch(/^<div role="status" aria-live="polite"/)
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/)
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

describe('MapLoadingOverlay', () => {
  it('shows nothing on first render even while loading, so fast responses never flash it', () => {
    expect(renderToStaticMarkup(<MapLoadingOverlay isLoading />)).not.toContain('Loading crashes…')
  })
})
