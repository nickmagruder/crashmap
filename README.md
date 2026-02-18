# CrashMap

**Version:** 0.3.1

A public-facing web application for visualizing crash data involving injuries and fatalities to bicyclists and pedestrians. Built with Next.js, Apollo GraphQL, Prisma, PostgreSQL/PostGIS, and Mapbox GL JS. The data is self-collected from state DOT websites and stored in a single PostgreSQL table. CrashMap follows a **classic three-tier architecture** (Client → Server → Data) deployed as a single Next.js application on Render.

This project was bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## Changelog

### 2026-02-17 — Apollo Client Setup (Phase 3 Start)

- Installed `@apollo/client` and `@apollo/client-integration-nextjs` (the current successor to the deprecated `@apollo/experimental-nextjs-app-support`)
- Created `lib/apollo-client.ts` — RSC client via `registerApolloClient` (use `getClient()` in Server Components)
- Created `app/apollo-provider.tsx` — `"use client"` wrapper with `ApolloNextAppProvider` for Client Components
- Updated `app/layout.tsx` to wrap children in `<ApolloProvider>`
- Configured `InMemoryCache` type policies: `Crash` → `keyFields: ["colliRptNum"]`; all aggregate/wrapper types → `keyFields: false`

### 2026-02-17 — Initial Config & Database Setup

- Scaffolded Next.js project with TypeScript, Tailwind CSS, and App Router
- Initialized shadcn/ui (`components.json`, `lib/utils.ts`)
- Added `ARCHITECTURE.md` with full stack architecture, data model, GraphQL schema, Prisma model, indexes, action plan, and stretch goals
- Added `CLAUDE.md` with project context for Claude Code sessions
- Enabled PostGIS extension on Render PostgreSQL database
- Added `CrashDate` DATE column to `crashdata` table (derived from ISO 8601 `FullDate` text column) with index (`idx_crashdata_date`)
- Installed Prisma CLI and `@prisma/client`
- Updated `.gitignore` with env file handling (`!.env.example`) and `prisma/migrations/`
- Updated `ARCHITECTURE.md` and `CLAUDE.md` to reflect new `CrashDate` column across schema, Prisma model, GraphQL types, materialized views, and checklists
- Added `tutorial.md` for step-by-step blog post draft

### 2026-02-17 — CI Pipeline

- Created `.github/workflows/ci.yml` with lint, format check, typecheck, and build steps
- Added `typecheck` script (`tsc --noEmit`) to `package.json`
- Added `.next/cache` caching to CI workflow to eliminate Next.js build cache warning and speed up repeat builds
- Added Vitest test step to CI workflow (runs all unit and integration tests before build)
- Configured `main` branch protection: require CI to pass before merging

### 2026-02-17 — Linting & Formatting

- Installed Prettier, `eslint-config-prettier`, Husky, and lint-staged
- Added `.prettierrc` (no semis, single quotes, 100 char width) and `.prettierignore`
- Updated `eslint.config.mjs` to include `eslint-config-prettier` and ignore `lib/generated/**`
- Initialized Husky with pre-commit hook running `lint-staged` on staged files
- Added `format` and `format:check` scripts to `package.json`
- Formatted all existing files with Prettier; ESLint and Prettier both pass clean

### 2026-02-17 — Materialized Views

- Created `filter_metadata` materialized view (distinct state/county/city combinations) with `idx_filter_metadata_geo` index for cascading dropdown queries
- Created `available_years` materialized view (distinct years from `CrashDate`)
- Fixed import artifact: 51 King County, WA rows with `CityName = "'"` set to NULL; refreshed `filter_metadata`

### 2026-02-17 — Data Validation

- Confirmed 1,315 rows with no null coordinates, no null `CrashDate`, all coordinates within US bounds
- Normalized `Mode` value "Bicycle" → "Bicyclist" (543 rows updated)
- Discovered `MostSevereInjuryType` has 8 raw values; defined 4 display buckets (Death, Major Injury, Minor Injury, None) with resolver-level mapping
- Updated `ARCHITECTURE.md` and `CLAUDE.md` to reflect real severity values and bucket mapping ("Serious Injury" renamed to "Major Injury")

### 2026-02-17 — PostGIS Geometry Column and Indexes

- Added generated `geom geometry(Point, 4326)` column to `crashdata` (computed from `Latitude`/`Longitude`, STORED)
- Created GIST spatial index (`idx_crashdata_geom`) for bounding-box and radius queries
- Created B-tree indexes on `MostSevereInjuryType`, `Mode`, `StateOrProvinceName`, `CountyName`, `CityName`
- Ran `prisma db pull` to pick up new column and indexes; `geom` represented as `Unsupported("geometry")` with GIST index captured as `type: Gist`
- Ran `prisma generate` to regenerate typed client

### 2026-02-17 — GraphQL Resolvers

- Implemented full Prisma resolvers in `lib/graphql/resolvers.ts`: `crashes`, `crash`, `crashStats`, `filterOptions` queries
- Added severity bucket mapping (`Death`/`Major Injury`/`Minor Injury`/`None`) with `rawToBucket` and `bucketsToRawValues` helpers
- Added `buildWhere` helper translating `CrashFilter` input to Prisma where clauses (mode, geography, date range, year shortcut, bbox, severity, `includeNoInjury`)
- `FilterOptions` field resolvers query `filter_metadata` and `available_years` materialized views via `$queryRaw`
- Created `lib/prisma.ts` singleton with `@prisma/adapter-pg` (required by Prisma 7's new `prisma-client` generator)
- Added `"postinstall": "prisma generate"` to `package.json` so CI generates the client after `npm ci`
- Installed `@prisma/adapter-pg`

### 2026-02-17 — Query Depth Limiting

- Added inline `depthLimitRule` validation rule to Apollo Server in `app/api/graphql/route.ts` (max depth: 5)
- No external dependency — rule walks the AST using graphql-js built-in types (`ValidationRule`, `ValidationContext`, `ASTNode`)

### 2026-02-17 — Pagination

- `crashes` query already had `limit`/`offset` args and `CrashResult.totalCount` from initial schema design; confirmed offset-based pagination is fully functional
- Added server-side `limit` cap of 5000 in resolver to prevent unbounded queries (`Math.min(limit ?? 1000, 5000)`)

### 2026-02-17 — GraphQL Codegen

- Installed `@graphql-codegen/cli`, `@graphql-codegen/typescript`, `@graphql-codegen/typescript-resolvers`
- Created `codegen.ts` — points `CodeFileLoader` at `lib/graphql/typeDefs.ts`; maps `Crash` parent to `CrashData` (Prisma model), `FilterOptions` parent to `{}`
- Added `"codegen": "graphql-codegen --config codegen.ts"` script to `package.json`
- Generated `lib/graphql/__generated__/types.ts` with full resolver and input types
- Updated `lib/graphql/resolvers.ts` to use generated `Resolvers` type — removed manual `CrashFilterInput` and `CrashParent` interfaces; all argument and parent types now enforced by codegen

### 2026-02-17 — GraphQL Schema

- Defined full GraphQL schema in `lib/graphql/typeDefs.ts`: `Crash`, `CrashResult`, `CrashStats`, `FilterOptions` types; `CrashFilter` and `BBoxInput` inputs; `crashes`, `crash`, `crashStats`, `filterOptions` queries
- Added stub resolvers in `lib/graphql/resolvers.ts` (Prisma implementation next)
- Updated `app/api/graphql/route.ts` to import from `lib/graphql/`

### 2026-02-17 — Apollo Server Setup

- Installed `@apollo/server`, `graphql`, and `@as-integrations/next`
- Created `app/api/graphql/route.ts` with a stub hello-world schema using `startServerAndCreateNextHandler`
- GraphQL endpoint accessible at `/api/graphql`; Apollo Sandbox Explorer available on GET

### 2026-02-17 — Resolver Integration Tests

- Installed Vitest (`vitest`) and created `vitest.config.ts` with `@` path alias matching tsconfig
- Added `test` and `test:watch` scripts to `package.json`
- Exported `SEVERITY_BUCKETS`, `rawToBucket`, `bucketsToRawValues`, `buildWhere` from `lib/graphql/resolvers.ts` for testability
- Created `lib/graphql/__tests__/helpers.test.ts` — 37 unit tests for severity mapping and filter-to-where-clause logic
- Created `lib/graphql/__tests__/queries.test.ts` — 19 integration tests using Apollo Server `executeOperation` with mocked Prisma (crashes, crash, crashStats, filterOptions queries + Crash field resolver edge cases)

### 2026-02-17 — Prisma Setup

- Initialized Prisma (`npx prisma init`) with PostgreSQL provider, generating `prisma/schema.prisma` and `prisma.config.ts`
- Installed `dotenv` dev dependency for Prisma config env loading
- Ran `npx prisma db pull` to introspect `crashdata` table from Render database
- Refined generated Prisma model: renamed to `CrashData`, added camelCase field names with `@map` decorators and `@@map("crashdata")`
- Ran `npx prisma generate` to produce typed client in `lib/generated/prisma/`
- Added `lib/generated/prisma` to `.gitignore`
