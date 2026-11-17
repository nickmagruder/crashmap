import { describe, it, expect } from 'vitest'
import { isMapboxRequest } from '../sentryConfig'

describe('isMapboxRequest', () => {
  it.each([
    'https://api.mapbox.com/styles/v1/mapbox/dark-v11?access_token=pk.test',
    'https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v8/10/163/357.vector.pbf',
    'https://events.mapbox.com/events/v2?access_token=pk.test',
    'https://mapbox.com/',
  ])('is true for Mapbox URL %s', (url) => {
    expect(isMapboxRequest(url)).toBe(true)
  })

  it.each([
    '/api/graphql',
    'https://crashmap.io/api/graphql',
    'https://crashmap.io/monitoring',
    'https://notmapbox.com/tiles',
    'https://mapbox.com.evil.example/tiles',
  ])('is false for non-Mapbox URL %s', (url) => {
    expect(isMapboxRequest(url)).toBe(false)
  })

  it('is false for an unparseable URL', () => {
    expect(isMapboxRequest('http://')).toBe(false)
  })
})
