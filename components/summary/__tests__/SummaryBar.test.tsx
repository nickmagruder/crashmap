import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SummaryBar } from '@/components/summary/SummaryBar'

const render = (...args: Parameters<typeof SummaryBar>) => renderToStaticMarkup(SummaryBar(...args))

describe('SummaryBar', () => {
  it('hides badge emoji from screen readers and reads the words instead', () => {
    const html = render({
      activeFilters: [
        { icon: '🚶🏽‍♀️', srText: 'Pedestrians' },
        { icon: '📍', text: 'Viewport' },
      ],
    })
    expect(html).toContain('<span aria-hidden="true">🚶🏽‍♀️</span>')
    expect(html).toContain('<span class="sr-only">Pedestrians</span>')
    expect(html).toContain('<span aria-hidden="true">📍</span>Viewport')
  })

  it('introduces the badges and lists them so screen readers pause between them', () => {
    const html = render({ activeFilters: [{ text: '1 Year' }, { text: 'King' }] })
    expect(html).toContain('<span class="sr-only">Active filters: </span>')
    expect(html).toMatch(/<ul role="list"[^>]*><li>.*1 Year.*<\/li><li>.*King.*<\/li><\/ul>/)
  })

  it('renders two badges with the same text, such as a county and city of the same name', () => {
    const html = render({ activeFilters: [{ text: 'Spokane' }, { text: 'Spokane' }] })
    expect(html.match(/<li>/g)).toHaveLength(2)
  })

  it('shows no loading spinner (the centered map overlay does that)', () => {
    expect(render({ activeFilters: [{ text: '1 Year' }] })).not.toContain('animate-spin')
  })

  it('renders no list when there are no active filters', () => {
    expect(render({ activeFilters: [] })).not.toContain('<ul')
  })
})
