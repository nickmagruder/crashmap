# CrashMap

**Version:** 0.4.3

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

### 2026-02-19 — Severity Multi-Select Filter

- Created `components/filters/SeverityFilter.tsx` — three checkboxes for Death, Major Injury, Minor Injury (all checked by default) plus a separate opt-in "No Injury / Unknown" checkbox below a divider; each row includes a colored dot matching the corresponding Mapbox circle color
- `toggleBucket()` builds a new `SeverityBucket[]` array and dispatches `SET_SEVERITY`; the None opt-in dispatches `TOGGLE_NO_INJURY` (handled separately in the reducer)
- Added `SeverityFilter` to `Sidebar` and `FilterOverlay`; `toCrashFilter()` merges both `severity` and `includeNoInjury` into `effectiveSeverity` before passing to the GraphQL query

### 2026-02-19 — Mode Toggle Filter

- Created `components/filters/ModeToggle.tsx` — shared `ToggleGroup` component with three items: **All** / **Bicyclist** / **Pedestrian**; maps `null` (all modes) ↔ the `"all"` string for Radix ToggleGroup's value prop; ignores empty-string deselection events so exactly one item is always active
- Added `ModeToggle` to `Sidebar` (desktop) and `FilterOverlay` (mobile), replacing the placeholder text in both; filter state is shared via `useFilterContext()` so both surfaces stay in sync
- Dispatches `SET_MODE` to `FilterContext`; `toCrashFilter()` already maps `mode` to the GraphQL `CrashFilter` input, so the map updates automatically on selection change

### 2026-02-19 — Filter State Context

- Created `context/FilterContext.tsx` — React `useReducer`-based filter state for all filter dimensions: mode (`Bicyclist`/`Pedestrian`/`null`), severity buckets (`Death`, `Major Injury`, `Minor Injury`), no-injury opt-in, date (year shortcut or custom range), and geographic cascading dropdowns (state → county → city)
- Cascading resets baked into the reducer: selecting a new state clears county and city; selecting a new county clears city
- `FilterProvider` wraps children in `app/layout.tsx`; `useFilterContext()` hook provides typed access to state and dispatch throughout the component tree
- `toCrashFilter()` helper converts `FilterState` → `CrashFilter` GraphQL input object; `getActiveFilterLabels()` derives human-readable badge strings for non-default active filters
- `CrashLayer` now reads filter state from context and passes it to the `GET_CRASHES` query; dispatches `SET_TOTAL_COUNT` after each query so `AppShell` can pass the live crash count to `SummaryBar`

### 2026-02-19 — Crash Detail Popup — Dark Mode

- Popup container dark mode override added to `globals.css` (`.dark .mapboxgl-popup-content`) — required `!important` to win the cascade against mapbox-gl's own stylesheet loaded via `layout.tsx`; popup arrow tip (`anchor-bottom`) and close button also themed
- Popup content muted text switched from Tailwind `text-muted-foreground` class to inline `style={{ color: 'var(--muted-foreground)' }}` — Tailwind v4 `@theme inline` may compile color utility classes as static values rather than live CSS variable references; direct inline CSS `var()` references update reliably when the `.dark` class toggles on `<html>`

### 2026-02-19 — Crash Detail Popup

- Clicking a crash circle opens a Mapbox `Popup` with date, time, injury type (raw `MostSevereInjuryType` value), mode, city/county, involved persons, and collision report number
- Report number links to the WSP crash report portal (`wrecr.wsp.wa.gov/wrecr/order`); opens in a new tab
- Added `injuryType` field to GraphQL schema (`typeDefs.ts`, `resolvers.ts`, generated types) returning the raw `MostSevereInjuryType` value; severity bucket is still used for the color dot
- Added `interactiveLayerIds` to `Map` component to enable feature-level click events; clicking empty space closes the popup
- Used `useMap` hook in `CrashLayer` to attach `mouseenter`/`mouseleave` cursor-pointer events on the circle layer
- Added `time`, `involvedPersons`, `city`, `county`, `injuryType` to `GET_CRASHES` query and GeoJSON feature properties

### 2026-02-19 — Style crash circles by severity and zoom

- Replace fixed circle styling with severity-aware appearance and zoom-scaled sizes.
- Circle color and opacity now use 'match' on the feature's severity (Death, Major Injury, Minor Injury, None) to provide a clear visual hierarchy
- Circle-radius interpolates with zoom and severity to keep markers legible at different scales.
- A fallback value is present for unknown severities and stroke width is set to 0.

### 2026-02-19 — Line Ending Normalization

- Added `.gitattributes` enforcing LF line endings on all platforms, fixing Prettier `format:check` failures on Windows caused by `git core.autocrlf=true` converting LF → CRLF on checkout

### 2026-02-19 — GeoJSON Data Layer

- Created `lib/graphql/queries.ts` with `GET_CRASHES` Apollo query document
- Created `components/map/CrashLayer.tsx` — fetches up to 5000 crashes via `useQuery`, converts to GeoJSON FeatureCollection, renders Mapbox `Source` + circle `Layer`
- Updated `MapContainer.tsx` to render `<CrashLayer />` inside `<Map>`
- Fixed Apollo Client v4 import paths: `useQuery` → `@apollo/client/react`; `HttpLink` → `@apollo/client/link/http`
- Fixed `PrismaPg` constructor: pass `{ connectionString }` PoolConfig instead of raw string
- Added `?sslmode=require` to `DATABASE_URL` for SSL-required Render external connections

### 2026-02-19 — Light/Dark Mode

- Installed `next-themes` for system-preference detection and localStorage persistence
- Created `components/theme-provider.tsx` — thin `NextThemesProvider` wrapper (`attribute="class"`, `defaultTheme="system"`, `enableSystem`)
- Created `components/ui/theme-toggle.tsx` — Sun/Moon icon button using `useTheme()`; CSS-driven icon swap avoids hydration flash
- Updated `app/layout.tsx` — added `ThemeProvider` wrapper and `suppressHydrationWarning` on `<html>`
- Updated `components/map/MapContainer.tsx` — swaps Mapbox basemap between `light-v11` and `dark-v11` based on `resolvedTheme`
- Updated `components/layout/AppShell.tsx` — consolidated top-right controls into a single flex container with ThemeToggle alongside filter button

### 2026-02-18 — Mobile Default Zoom

- Set `MapContainer` default view to Seattle (longitude -122.3321, latitude 47.6062, zoom 11) on mobile (<768px); Washington state view unchanged on desktop

### 2026-02-18 — Wire map.resize() to Sidebar and Overlay Transitions

- Converted `MapContainer` to a `forwardRef` component so the Mapbox `MapRef` can be held in `AppShell`
- Added `mapRef = useRef<MapRef>(null)` in `AppShell`; `useEffect` watching `[sidebarOpen, overlayOpen]` calls `mapRef.current?.resize()` after a 300ms delay to let the Sheet slide animation complete before Mapbox recomputes canvas bounds
- `MapRef` imported from `react-map-gl/mapbox` (root `react-map-gl` is not resolvable as a module in this project setup)

### 2026-02-18 — SummaryBar Component

- Created `components/summary/SummaryBar.tsx` — floating pill centered at viewport bottom showing crash count (`"—"` placeholder) and active filter badges; `bg-background/90 backdrop-blur-sm` overlay style; `role="status" aria-live="polite"` for screen readers
- Updated `AppShell.tsx` to render `<SummaryBar />` (no props wired yet — count and filters connected when filter panel is built)

### 2026-02-18 — Mobile Filter Overlay Scaffold

- Created `components/overlay/FilterOverlay.tsx` — full-screen fixed overlay (`md:hidden`), with header, close button, and scrollable content area; renders `null` when closed
- Updated `AppShell.tsx` — added `overlayOpen` state and a mobile-only floating toggle button (`md:hidden`) at the same position as the desktop button; both swap cleanly at the `md` breakpoint

### 2026-02-18 — Desktop Sidebar Scaffold

- Created `components/sidebar/Sidebar.tsx` — Sheet-based right panel (320px), desktop-only overlay with "Filters" header and placeholder content
- Created `components/layout/AppShell.tsx` — `'use client'` wrapper managing sidebar open/close state; renders `MapContainer`, a floating `SlidersHorizontal` toggle button (hidden on mobile via `hidden md:block`), and `Sidebar`
- Updated `app/page.tsx` to render `AppShell` instead of `MapContainer` directly; page stays a Server Component

### 2026-02-18 — Map Page Built

- Created `components/map/MapContainer.tsx` — `'use client'` component with `react-map-gl/mapbox`, centered on Washington state, `light-v11` basemap
- Replaced `app/page.tsx` boilerplate with a full-viewport layout (`100dvh`, `position: relative` for future overlays)
- Added `devIndicators: false` to `next.config.ts` to suppress the Next.js dev-mode badge overlapping the map

### 2026-02-18 — Mapbox Token Configured

- Added `NEXT_PUBLIC_MAPBOX_TOKEN` to `.env.local` for local development (gitignored)
- Set `NEXT_PUBLIC_MAPBOX_TOKEN` in Render dashboard for production (already declared in `render.yaml` with `sync: false`)
- Applied URL restrictions to the Mapbox public token (localhost, Render URL, crashmap.io)

### 2026-02-18 — Map Dependencies Installed

- Installed `react-map-gl@8.1.0`, `mapbox-gl@3.18.1`, `@types/mapbox-gl@3.4.1`
- Added `transpilePackages: ['react-map-gl', 'mapbox-gl']` to `next.config.ts` for ESM/App Router compatibility
- Added `import 'mapbox-gl/dist/mapbox-gl.css'` to `app/layout.tsx` (required for popups, markers, and controls to render correctly)

### 2026-02-18 — shadcn/ui Components

- Added 10 shadcn/ui components to `components/ui/`: `button`, `select`, `checkbox`, `toggle-group`, `toggle`, `sheet`, `dialog`, `badge`, `popover`, `calendar`
- New runtime dependencies: `date-fns`, `react-day-picker` (required by `calendar`)
- CLI command changed from `npx shadcn-ui@latest` to `npx shadcn@latest` (package was renamed)

### 2026-02-18 — Render Smoke-Test Deploy Confirmed

- Created Render web service linked to GitHub `main` branch; auto-deploy set to **After CI Checks Pass**
- `/api/graphql` GraphQL endpoint verified live on Render; full stack confirmed working in production

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

### 2026-02-17 — Render Deployment Setup

- Added `render.yaml` declaring web service build/start commands, Node 20, and env var declarations (`DATABASE_URL`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `NEXT_PUBLIC_APP_URL`)
- Created `.env.example` documenting all required env vars with placeholder values
- Set `output: 'standalone'` in `next.config.ts` for optimized Render deploys (start command: `node .next/standalone/server.js`)
- Confirmed production build passes locally (`npm run build` compiles clean; Windows-only EINVAL warning on bracket filenames is harmless on Render's Linux)

### 2026-02-17 — Prisma Setup

- Initialized Prisma (`npx prisma init`) with PostgreSQL provider, generating `prisma/schema.prisma` and `prisma.config.ts`
- Installed `dotenv` dev dependency for Prisma config env loading
- Ran `npx prisma db pull` to introspect `crashdata` table from Render database
- Refined generated Prisma model: renamed to `CrashData`, added camelCase field names with `@map` decorators and `@@map("crashdata")`
- Ran `npx prisma generate` to produce typed client in `lib/generated/prisma/`
- Added `lib/generated/prisma` to `.gitignore`
