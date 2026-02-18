import { ApolloServer } from '@apollo/server'
import { startServerAndCreateNextHandler } from '@as-integrations/next'
import { NextRequest } from 'next/server'

const typeDefs = `#graphql
  type Query {
    hello: String
  }
`

const resolvers = {
  Query: {
    hello: () => 'Hello from CrashMap GraphQL!',
  },
}

const server = new ApolloServer({ typeDefs, resolvers })

const handler = startServerAndCreateNextHandler<NextRequest>(server)

export { handler as GET, handler as POST }
