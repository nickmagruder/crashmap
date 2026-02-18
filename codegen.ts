import type { CodegenConfig } from '@graphql-codegen/cli'

// Run after schema changes: npm run codegen
// Requires prisma generate to have run first (postinstall does this automatically).
const config: CodegenConfig = {
  // CodeFileLoader picks up the named `typeDefs` export from the TypeScript file.
  schema: './lib/graphql/typeDefs.ts',
  generates: {
    'lib/graphql/__generated__/types.ts': {
      plugins: [{ add: { content: '/* eslint-disable */' } }, 'typescript', 'typescript-resolvers'],
      config: {
        // Map GraphQL object types to their backing TypeScript types.
        // Crash field resolvers receive CrashData (Prisma model) as the parent object.
        // FilterOptions field resolvers receive {} — the empty object returned by
        // the filterOptions Query resolver; field resolvers supply all real data.
        mappers: {
          Crash: '../../generated/prisma/client#CrashData',
          FilterOptions: '{}',
        },
        scalars: {
          ID: 'string',
        },
      },
    },
  },
  // Suppress "no documents" warning — client-side query documents come in Phase 3.
  ignoreNoDocuments: true,
}

export default config
