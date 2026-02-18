import { describe, it, expect } from 'vitest'
import { rawToBucket, bucketsToRawValues, buildWhere, SEVERITY_BUCKETS } from '../resolvers'

// ── rawToBucket ─────────────────────────────────────────────────────────────

describe('rawToBucket', () => {
  // Death bucket
  it('maps "Dead at Scene" to "Death"', () => {
    expect(rawToBucket('Dead at Scene')).toBe('Death')
  })
  it('maps "Died in Hospital" to "Death"', () => {
    expect(rawToBucket('Died in Hospital')).toBe('Death')
  })
  it('maps "Dead on Arrival" to "Death"', () => {
    expect(rawToBucket('Dead on Arrival')).toBe('Death')
  })

  // Major Injury bucket
  it('maps "Suspected Serious Injury" to "Major Injury"', () => {
    expect(rawToBucket('Suspected Serious Injury')).toBe('Major Injury')
  })

  // Minor Injury bucket
  it('maps "Suspected Minor Injury" to "Minor Injury"', () => {
    expect(rawToBucket('Suspected Minor Injury')).toBe('Minor Injury')
  })
  it('maps "Possible Injury" to "Minor Injury"', () => {
    expect(rawToBucket('Possible Injury')).toBe('Minor Injury')
  })

  // None bucket
  it('maps "No Apparent Injury" to "None"', () => {
    expect(rawToBucket('No Apparent Injury')).toBe('None')
  })
  it('maps "Unknown" to "None"', () => {
    expect(rawToBucket('Unknown')).toBe('None')
  })

  // Edge cases
  it('returns null for null input', () => {
    expect(rawToBucket(null)).toBeNull()
  })
  it('returns null for undefined input', () => {
    expect(rawToBucket(undefined)).toBeNull()
  })
  it('returns null for empty string', () => {
    expect(rawToBucket('')).toBeNull()
  })
  it('passes through unmapped values as-is', () => {
    expect(rawToBucket('Some Future Value')).toBe('Some Future Value')
  })
})

// ── bucketsToRawValues ──────────────────────────────────────────────────────

describe('bucketsToRawValues', () => {
  it('expands "Death" to three raw values', () => {
    expect(bucketsToRawValues(['Death'])).toEqual([
      'Dead at Scene',
      'Died in Hospital',
      'Dead on Arrival',
    ])
  })

  it('expands "Major Injury" to one raw value', () => {
    expect(bucketsToRawValues(['Major Injury'])).toEqual(['Suspected Serious Injury'])
  })

  it('expands "Minor Injury" to two raw values', () => {
    expect(bucketsToRawValues(['Minor Injury'])).toEqual([
      'Suspected Minor Injury',
      'Possible Injury',
    ])
  })

  it('expands "None" to two raw values', () => {
    expect(bucketsToRawValues(['None'])).toEqual(['No Apparent Injury', 'Unknown'])
  })

  it('expands multiple buckets into combined raw values', () => {
    const result = bucketsToRawValues(['Death', 'Minor Injury'])
    expect(result).toEqual([
      'Dead at Scene',
      'Died in Hospital',
      'Dead on Arrival',
      'Suspected Minor Injury',
      'Possible Injury',
    ])
  })

  it('returns empty array for empty input', () => {
    expect(bucketsToRawValues([])).toEqual([])
  })

  it('passes through unknown bucket names as-is', () => {
    expect(bucketsToRawValues(['SomeNewBucket'])).toEqual(['SomeNewBucket'])
  })

  it('filters out null and undefined elements', () => {
    expect(bucketsToRawValues([null, undefined, 'Death'])).toEqual([
      'Dead at Scene',
      'Died in Hospital',
      'Dead on Arrival',
    ])
  })
})

// ── buildWhere ──────────────────────────────────────────────────────────────

describe('buildWhere', () => {
  const NONE_RAW = SEVERITY_BUCKETS['None']

  // buildWhere returns a spread object whose exact type is a union — cast to
  // Record so we can assert on dynamic property names without TS errors.
  const where = (filter?: Parameters<typeof buildWhere>[0]) =>
    buildWhere(filter) as Record<string, unknown>

  // Default None exclusion
  it('excludes None severity by default (no filter)', () => {
    expect(where()).toEqual({ mostSevereInjuryType: { notIn: NONE_RAW } })
  })

  it('excludes None severity when filter is empty object', () => {
    expect(where({}).mostSevereInjuryType).toEqual({ notIn: NONE_RAW })
  })

  it('excludes None severity when filter is null', () => {
    expect(where(null).mostSevereInjuryType).toEqual({ notIn: NONE_RAW })
  })

  // includeNoInjury
  it('does not exclude None when includeNoInjury is true', () => {
    expect(where({ includeNoInjury: true }).mostSevereInjuryType).toBeUndefined()
  })

  // Severity filter
  it('expands severity buckets to raw values with in clause', () => {
    expect(where({ severity: ['Death'] }).mostSevereInjuryType).toEqual({
      in: ['Dead at Scene', 'Died in Hospital', 'Dead on Arrival'],
    })
  })

  it('severity filter overrides default None exclusion', () => {
    expect(where({ severity: ['None'] }).mostSevereInjuryType).toEqual({
      in: ['No Apparent Injury', 'Unknown'],
    })
  })

  // Simple field filters
  it('adds mode filter', () => {
    expect(where({ mode: 'Bicyclist', includeNoInjury: true }).mode).toBe('Bicyclist')
  })

  it('adds state filter', () => {
    expect(where({ state: 'Ohio', includeNoInjury: true }).stateOrProvinceName).toBe('Ohio')
  })

  it('adds county filter', () => {
    expect(where({ county: 'Franklin', includeNoInjury: true }).countyName).toBe('Franklin')
  })

  it('adds city filter', () => {
    expect(where({ city: 'Columbus', includeNoInjury: true }).cityName).toBe('Columbus')
  })

  // Year filter
  it('converts year to date range', () => {
    expect(where({ year: 2024, includeNoInjury: true }).crashDate).toEqual({
      gte: new Date('2024-01-01'),
      lte: new Date('2024-12-31'),
    })
  })

  // Date range filter
  it('handles dateFrom only', () => {
    expect(where({ dateFrom: '2024-06-01', includeNoInjury: true }).crashDate).toEqual({
      gte: new Date('2024-06-01'),
    })
  })

  it('handles dateTo only', () => {
    expect(where({ dateTo: '2024-12-31', includeNoInjury: true }).crashDate).toEqual({
      lte: new Date('2024-12-31'),
    })
  })

  it('handles both dateFrom and dateTo', () => {
    expect(
      where({ dateFrom: '2024-01-01', dateTo: '2024-06-30', includeNoInjury: true }).crashDate
    ).toEqual({
      gte: new Date('2024-01-01'),
      lte: new Date('2024-06-30'),
    })
  })

  it('year takes precedence over dateFrom/dateTo', () => {
    expect(
      where({ year: 2023, dateFrom: '2024-01-01', dateTo: '2024-12-31', includeNoInjury: true })
        .crashDate
    ).toEqual({
      gte: new Date('2023-01-01'),
      lte: new Date('2023-12-31'),
    })
  })

  // Bounding box
  it('adds bbox filter', () => {
    const w = where({
      bbox: { minLat: 39.9, maxLat: 40.1, minLng: -83.1, maxLng: -82.9 },
      includeNoInjury: true,
    })
    expect(w.latitude).toEqual({ gte: 39.9, lte: 40.1 })
    expect(w.longitude).toEqual({ gte: -83.1, lte: -82.9 })
  })

  // Combined filters
  it('combines multiple filters', () => {
    const w = where({
      mode: 'Pedestrian',
      state: 'Ohio',
      county: 'Franklin',
      severity: ['Death', 'Major Injury'],
      year: 2024,
    })
    expect(w.mode).toBe('Pedestrian')
    expect(w.stateOrProvinceName).toBe('Ohio')
    expect(w.countyName).toBe('Franklin')
    expect(w.crashDate).toBeDefined()
    expect(w.mostSevereInjuryType).toEqual({
      in: ['Dead at Scene', 'Died in Hospital', 'Dead on Arrival', 'Suspected Serious Injury'],
    })
  })
})
