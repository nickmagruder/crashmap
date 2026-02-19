import { gql } from '@apollo/client'

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
