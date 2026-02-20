import { gql } from '@apollo/client'

// ── Query result types ─────────────────────────────────────────────────────────

export type GetFilterOptionsQuery = {
  filterOptions: {
    states: string[]
    years: number[]
  }
}

export type GetCountiesQuery = {
  filterOptions: {
    counties: string[]
  }
}

export type GetCitiesQuery = {
  filterOptions: {
    cities: string[]
  }
}

// ── Query documents ────────────────────────────────────────────────────────────

export const GET_FILTER_OPTIONS = gql`
  query GetFilterOptions {
    filterOptions {
      states
      years
    }
  }
`

export const GET_COUNTIES = gql`
  query GetCounties($state: String) {
    filterOptions {
      counties(state: $state)
    }
  }
`

export const GET_CITIES = gql`
  query GetCities($state: String, $county: String) {
    filterOptions {
      cities(state: $state, county: $county)
    }
  }
`

export const GET_CRASHES = gql`
  query GetCrashes($filter: CrashFilter, $limit: Int) {
    crashes(filter: $filter, limit: $limit) {
      items {
        colliRptNum
        latitude
        longitude
        severity
        injuryType
        mode
        crashDate
        time
        involvedPersons
        city
        county
      }
      totalCount
    }
  }
`
