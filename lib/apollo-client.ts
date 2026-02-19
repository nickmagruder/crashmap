import { HttpLink } from '@apollo/client/link/http'
import {
  ApolloClient,
  InMemoryCache,
  registerApolloClient,
} from '@apollo/client-integration-nextjs'

function makeCache() {
  return new InMemoryCache({
    typePolicies: {
      // Crash has a natural ID: colliRptNum (Apollo defaults to "id" or "_id")
      Crash: {
        keyFields: ['colliRptNum'],
      },
      // Wrapper and aggregate types have no natural ID — skip normalization
      CrashResult: { keyFields: false },
      CrashStats: { keyFields: false },
      FilterOptions: { keyFields: false },
      ModeStat: { keyFields: false },
      SeverityStat: { keyFields: false },
      CountyStat: { keyFields: false },
    },
  })
}

// RSC / Server Component client
// NEXT_PUBLIC_APP_URL must be set in production (e.g. https://crashmap.onrender.com)
export const { getClient, query, PreloadQuery } = registerApolloClient(() => {
  return new ApolloClient({
    cache: makeCache(),
    link: new HttpLink({
      uri: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/graphql`,
    }),
  })
})
