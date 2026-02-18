'use client'

import { HttpLink } from '@apollo/client'
import {
  ApolloClient,
  ApolloNextAppProvider,
  InMemoryCache,
} from '@apollo/client-integration-nextjs'

function makeClient() {
  const httpLink = new HttpLink({ uri: '/api/graphql' })

  return new ApolloClient({
    cache: new InMemoryCache({
      typePolicies: {
        Crash: { keyFields: ['colliRptNum'] },
        CrashResult: { keyFields: false },
        CrashStats: { keyFields: false },
        FilterOptions: { keyFields: false },
        ModeStat: { keyFields: false },
        SeverityStat: { keyFields: false },
        CountyStat: { keyFields: false },
      },
    }),
    link: httpLink,
  })
}

export function ApolloProvider({ children }: React.PropsWithChildren) {
  return <ApolloNextAppProvider makeClient={makeClient}>{children}</ApolloNextAppProvider>
}
