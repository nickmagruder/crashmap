# CLAUDE.md — CrashMap Project Context

> **Generated from architecture planning conversation. This file provides context for Claude Code sessions.**

## Project Overview

**CrashMap** (crashmap.io) is a public-facing web application for visualizing crash data involving injuries and fatalities to **bicyclists and pedestrians**. The data is self-collected, stored in a single PostgreSQL table, and displayed on an interactive Mapbox map with filters.

## Key Decisions Made

### Stack

- **Frontend:** Next.js (App Router) + React + TypeScript
- **UI Components:** shadcn/ui (Radix UI + Tailwind CSS) — copy-paste ownership model
- **State Management:** React Context for local UI state (filter selections, sidebar toggle, view preferences)
- **Map:** Mapbox GL JS via `react-map-gl`
- **API:** Apollo Server integrated into Next.js API route (`/app/api/graphql`)
- **GraphQL Client:** Apollo Client with InMemoryCache
- **ORM:** Prisma 7 with `provider = "prisma-client"` generator and `@prisma/adapter-pg` driver adapter (use `prisma db pull` to introspect existing table — do NOT use `prisma migrate dev`)
- **Database:** PostgreSQL + PostGIS on Render (Basic plan, 5GB)
- **Hosting:** Render — Professional plan (web service), Basic plan (database)
- **Domain:** crashmap.io (purchased)
- **Type Generation:** `graphql-codegen` for end-to-end TypeScript types

### Database Schema (already exists on Render)

```sql
CREATE TABLE public.crashdata
(
    "ColliRptNum" text NOT NULL,
    "Jurisdiction" text,
    "StateOrProvinceName" text,
    "RegionName" text,
    "CountyName" text,
    "CityName" text,
    "FullDate" text,
    "FullTime" text,
    "MostSevereInjuryType" text,
    "AgeGroup" text,
    "InvolvedPersons" smallint,
    "CrashStatePlaneX" real,
    "CrashStatePlaneY" real,
    "Latitude" double precision,
    "Longitude" double precision,
    "Mode" text,
    "CrashDate" date,
    PRIMARY KEY ("ColliRptNum")
);
```

**Important notes on this schema:**

- `FullDate` is stored as `text` in ISO 8601 format (`2025-02-23T00:00:00`). Use `CrashDate` (proper DATE column) for all date-range queries and filtering.
- `Mode` values are "Bicyclist" or "Pedestrian"
- `MostSevereInjuryType` raw DB values and their 4-bucket display mapping:
  - **Death**: "Dead at Scene", "Died in Hospital", "Dead on Arrival"
  - **Major Injury**: "Suspected Serious Injury"
  - **Minor Injury**: "Suspected Minor Injury", "Possible Injury"
  - **None**: "No Apparent Injury", "Unknown"
  - Additional values may appear as more data sources are imported — always map dynamically
- Prisma model uses `@map` decorators to map camelCase TS properties to the existing PascalCase column names
- A generated PostGIS `geom` column exists for spatial queries (see ARCHITECTURE.md Section 3)

### Prisma 7 Client Notes

- Generator: `provider = "prisma-client"` (new WASM-based compiler, NOT the legacy `prisma-client-js`)
- Generated output: `lib/generated/prisma/` (gitignored — regenerated via `postinstall: prisma generate`)
- **Import path:** `@/lib/generated/prisma/client` (no bare `index.ts` — use `/client` suffix)
- **Constructor requires a driver adapter** — `new PrismaClient()` with no args will not type-check. Use:

  ```ts
  import { PrismaPg } from '@prisma/adapter-pg'
  new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) })
  ```

- Prisma singleton lives in `lib/prisma.ts`; use `globalThis` pattern to prevent connection pool exhaustion in dev hot reloads

### Data Scale & Traffic

- Starts at a few thousand rows, may grow to tens of thousands
- Low daily active users (public-facing but niche)
- No real-time data streams needed
- No Redis, no DataLoader, no complex caching needed at this scale
- Apollo Client InMemoryCache is the only caching layer

### Architecture Simplifications (intentional)

- **Single table** — no joins, no N+1 concerns
- **No auth for public views** — all crash data queries are open
- **Offset-based pagination** — fine at this scale
- **No Redis** — not needed for low traffic
- **No DataLoader** — single table means no batching needed
- Full dataset can likely be loaded as GeoJSON client-side and filtered by Mapbox

## MVP Features

### Filters

All filters are combinable (AND logic) and update the map in real time.

| Filter                         | shadcn/ui Component                                             | DB Column              |
| ------------------------------ | --------------------------------------------------------------- | ---------------------- |
| Date Range / Year              | `Popover` + `Calendar` + `Button` (4 year quick-select buttons) | `CrashDate`            |
| State                          | `Select`                                                        | `StateOrProvinceName`  |
| County (cascading from State)  | `Select`                                                        | `CountyName`           |
| City (cascading from County)   | `Select`                                                        | `CityName`             |
| Mode                           | `ToggleGroup`                                                   | `Mode`                 |
| Injury Severity (multi-select) | `Checkbox` + `Label`                                            | `MostSevereInjuryType` |

- None injuries are **hidden by default** but can be toggled on
- Cascading dropdowns powered by a `filter_metadata` materialized view
- Year buttons show most recent 4 years as one-click shortcuts

### Map Icon Design

Severity-based visual hierarchy using color, opacity, AND size:

| Severity Bucket | Color                         | Opacity | Base Size |
| --------------- | ----------------------------- | ------- | --------- |
| Death           | `#B71C1C` (dark red)          | 85%     | 8px       |
| Major Injury    | `#E65100` (orange)            | 70%     | 7px       |
| Minor Injury    | `#F9A825` (yellow)            | 55%     | 6px       |
| None            | `#C5E1A5` (pale yellow-green) | 50%     | 5px       |

- All sizes scale with zoom level via Mapbox `interpolate` expressions (small at state zoom, large at street zoom)
- Stroke color differentiates mode: blue (`#1565C0`) for bicyclists, purple (`#4A148C`) for pedestrians
- Stroke width also scales with zoom

### UI Layout (Mobile-First)

- **Full-viewport map** on all screen sizes (`100dvh`)
- **Mobile (<768px):** Floating overlay controls, full-screen filter overlay (toggle open/close), persistent summary bar with crash count + active filter badges
- **Desktop (≥768px):** Toggleable right sidebar (~320px) using shadcn/ui `Sheet` component
- Must call `map.resize()` after sidebar open/close transitions

## Stretch Goals (not MVP)

1. **Dashboard charts** — Recharts/D3 visualizations (severity, mode, time trends, geographic breakdowns)
2. **Mobile bottom sheet** — Upgrade from full-screen overlay; recommended library: `vaul` or `react-modal-sheet`
3. **Light/Dark mode** — shadcn/ui built-in theming + `next-themes` + Mapbox style swap (`light-v11` ↔ `dark-v11`)

## Tutorial / Blog Post

- `tutorial.md` — Running draft of a step-by-step tutorial following this project from start to finish, intended for an eventual blog post
- When completing significant steps (new tool setup, config changes, database operations, etc.), update `tutorial.md` with clear step-by-step instructions explaining what was done and why
- Write in a tutorial tone — assume the reader is following along and building the project from scratch

## Versioning

- Semantic versioning: **MAJOR.MINOR.PATCH**
- Current version is tracked on **line 2 of `README.md`** as `**Version:** x.x.x`
- Started at `0.1.0` during pre-launch development
- **PATCH** — bug fixes, dependency updates, config/docs changes
- **MINOR** — new user-facing features (new filter, dashboard charts, dark mode)
- **MAJOR** — breaking changes to the API or data schema
- Bump to **1.0.0** at public launch on crashmap.io

## Changelog

- Maintain a running changelog at the bottom of `README.md`
- When completing significant changes (new features, config changes, database operations, dependency additions), append a dated entry summarizing what was done
- Group related changes under a single date heading
- Keep entries concise — one bullet per change

## Key Files

- `ARCHITECTURE.md` — Full architecture document with data model, GraphQL schema, Prisma model, SQL indexes, action plan, and all technical details
- `tutorial.md` — Step-by-step tutorial draft for blog post
- `README.md` — Project readme with changelog at the bottom
- `prisma/schema.prisma` — Prisma schema (introspected via `prisma db pull`; do NOT run `prisma migrate dev`)
- `lib/prisma.ts` — PrismaClient singleton (with `@prisma/adapter-pg`)
- `lib/graphql/typeDefs.ts` — Full GraphQL schema (SDL string)
- `lib/graphql/resolvers.ts` — All resolvers with severity bucket mapping and `buildWhere` helper
- `app/api/graphql/route.ts` — Apollo Server route handler; also contains the inline `depthLimitRule` validation rule (max depth: 5)
- `lib/graphql/__generated__/types.ts` — Generated GraphQL types (committed; regenerated via `npm run codegen`)
- `lib/graphql/__tests__/helpers.test.ts` — Unit tests for `rawToBucket`, `bucketsToRawValues`, `buildWhere`
- `lib/graphql/__tests__/queries.test.ts` — Integration tests for all GraphQL queries via `executeOperation` with mocked Prisma
- `vitest.config.ts` — Vitest configuration with `@` path alias
- `components/layout/AppShell.tsx` — `'use client'` layout orchestrator; owns sidebar/overlay open state, renders SummaryBar
- `components/map/MapContainer.tsx` — `'use client'` Mapbox map filling parent container
- `components/sidebar/Sidebar.tsx` — Sheet-based right panel (desktop, ≥768px)
- `components/overlay/FilterOverlay.tsx` — Full-screen filter overlay (mobile, <768px)
- `components/summary/SummaryBar.tsx` — Floating pill with crash count + active filter badges (all screen sizes)
- `lib/generated/prisma/` — Generated Prisma client (gitignored; regenerated via `postinstall: prisma generate`)

## What's Done

- [x] Domain purchased (crashmap.io)
- [x] Next.js project created
- [x] Render Professional plan (web service)
- [x] Render Basic PostgreSQL (5GB) with data loaded
- [x] Architecture document complete

---

## 8. Step-by-Step Action Plan

### Phase 1: Foundation (Day 1)

#### Milestone: Project scaffolding and data model

- [x] Purchase domain: **crashmap.io** ✓
- [x] Initialize Next.js project with TypeScript (`create-next-app --typescript`)
- [x] Initialize Tailwind CSS and shadcn/ui (`npx shadcn-ui@latest init`)
- [x] Set up PostgreSQL with PostGIS extension on your existing Render database (`CREATE EXTENSION postgis;`)
- [x] Run `prisma db pull` to introspect your existing `crashdata` table, then refine the generated Prisma model (see Section 3 for the recommended model)
- [x] Add the generated `geom` geometry column and create recommended indexes (see Section 3)
- [x] Verify `FullDate` column format (ISO 8601: `2025-02-23T00:00:00`) and add `CrashDate` DATE column with index
- [x] Validate data: check for null `Latitude`/`Longitude` values, confirm `Mode` values are consistent ("Bicyclist"/"Pedestrian"), check `MostSevereInjuryType` distinct values
- [x] Create the `filter_metadata` and `available_years` materialized views (see Section 4) for cascading dropdown population
- [x] Set up ESLint, Prettier, Husky pre-commit hooks

**Deliverables:** Running Next.js app, populated database, Prisma client generated

### Phase 2: API Layer (Day 1)

#### Milestone: Functional GraphQL API with core queries

- [x] Install Apollo Server and configure in `/app/api/graphql/route.ts`
- [x] Define GraphQL schema matching the types in Section 3:
  - Queries: `crashes(filter, limit, offset)`, `crash(colliRptNum)`, `crashStats(filter)`, `filterOptions`
  - Filters: by date/year, state, county, city, mode (Bicyclist/Pedestrian), severity (multi-select), bounding box
  - No mutations needed for public-facing app (add later if you build an admin interface)
- [x] Implement resolvers with Prisma (single-table queries — straightforward)
- [x] Set up `graphql-codegen` for automatic TypeScript type generation
- [x] Implement simple offset-based pagination
- [x] Add query depth limiting for public API protection
- [x] Write integration tests for all resolvers
- [x] Set up GitHub Actions CI pipeline (lint, format check, typecheck, build, `.next/cache` caching) with branch protection on `main`

**Deliverables:** Fully tested GraphQL API accessible via Apollo Sandbox

### Phase 3: Frontend Core (Week 1)

#### Milestone: Basic UI Configuration, Skeleton Layout and Deployment

- [x] Set up Apollo Client with InMemoryCache and type policies
- [x] **Smoke-test deployment to Render** ✓
  - `render.yaml` created with standalone build/start commands, Node 20, env var declarations
  - `.env.example` created; `DATABASE_URL` set only in Render dashboard (never committed)
  - `output: 'standalone'` set in `next.config.ts`; start command: `node .next/standalone/server.js`
  - Auto-deploy configured to **After CI Checks Pass**
  - Build and deploy confirmed successful; `/api/graphql` endpoint live at `https://crashmap.onrender.com/api/graphql`
- [x] Install shadcn/ui components needed for the UI:
  - `npx shadcn@latest add button select checkbox toggle-group sheet dialog badge popover calendar`
- [x] Install map dependencies: `react-map-gl`, `mapbox-gl`
  - `npm install react-map-gl mapbox-gl @types/mapbox-gl`
  - Add `transpilePackages: ['react-map-gl', 'mapbox-gl']` to `next.config.ts` (ESM/App Router compat)
  - Import `mapbox-gl/dist/mapbox-gl.css` in `app/layout.tsx` (required for popups, markers, controls)
  - `NEXT_PUBLIC_MAPBOX_TOKEN` must be set in `.env.local` (already in `.env.example`)
- [x] Secure Mapbox access token via environment variable (`NEXT_PUBLIC_MAPBOX_TOKEN`)
- [x] Replace `app/page.tsx` with a full-viewport root layout container (`100dvh`, relative positioning)
  - Strip all Next.js boilerplate; render `<MapContainer />` inside `<div style={{ position: 'relative', width: '100%', height: '100dvh' }}>`
  - `position: relative` is the anchor for future absolutely-positioned overlays
  - `page.tsx` stays a Server Component; client code is isolated in `MapContainer`
  - Added `devIndicators: false` to `next.config.ts` to suppress the Next.js dev-mode badge
- [x] Build `MapContainer` component: `react-map-gl` map filling 100% of its container, Mapbox token from env var, no data layers yet
  - File: `components/map/MapContainer.tsx` — `'use client'` (Mapbox has no SSR support)
  - Import `Map` from `react-map-gl/mapbox` (required for mapbox-gl >= 3.5)
  - `mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`
  - `initialViewState`: longitude -120.5, latitude 47.5, zoom 7 (Washington state)
  - `mapStyle="mapbox://styles/mapbox/light-v11"` — clean light basemap for data visualization
  - `style={{ width: '100%', height: '100%' }}` — fills parent; parent owns `100dvh`
- [x] Build desktop `Sidebar` component: fixed right panel (~320px) using shadcn/ui `Sheet`, toggled by a header button, hidden on mobile
- [x] Build mobile `FilterOverlay` component: full-screen overlay with open/close toggle button, visible only on mobile (<768px)
- [x] Build `SummaryBar` component: persistent bar with placeholder crash count and empty filter badge area, visible on all screen sizes
- [x] Wire `map.resize()` to sidebar and overlay open/close transitions
- [ ] Smoke test responsive layout at mobile (<768px) and desktop (≥768px) breakpoints
- [ ] Import Domain into Render settings

#### Milestone: Interactive map with filters

- [ ] Build interactive map component with Mapbox GL JS (`react-map-gl`):
  - GeoJSON source built from `Latitude`/`Longitude` fields
  - Circle layer with severity-based color/opacity gradient (see Section 4 for palette)
  - Stroke color differentiation for bicyclist vs. pedestrian mode
  - None/Unknown injuries hidden by default via Mapbox layer filter
  - Heatmap layer for density visualization at low zoom levels
  - Built-in clustering with `cluster: true` on the GeoJSON source
  - Popup/tooltip on click showing crash details (date, severity, mode, location, age group)
- [ ] Implement filter panel (see Section 4 for full spec):
  - Date Range: year quick-select buttons (most recent 4 years) + custom date range picker
  - State → County → City cascading dropdowns (powered by `filter_metadata` view)
  - Mode toggle: Bicyclist / Pedestrian / All
  - Severity multi-select: Death, Serious, Minor (None/Unknown opt-in)
- [ ] Load filter options on app init via `filterOptions` GraphQL query
- [ ] Connect filters to GraphQL query variables

**Deliverables:** Working app with map and filters

### Phase 4: Security, Polish & Deployment (Weeks TBD)

#### Milestone: Production-ready public application

- [ ] Add rate limiting middleware for public API abuse prevention
- [ ] Configure CSP headers and CORS in Next.js
- [ ] Add loading states, error boundaries, skeleton screens
- [ ] Implement URL-based state for shareable filter configurations (e.g., `?severity=Death&mode=Pedestrian&state=Ohio&county=Franklin`)
- [ ] Add data export (CSV/PDF) for filtered results
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Add a data disclaimer, methodology page, and links to bicycle/pedestrian safety resources
- [ ] Deploy to Render with staging and production environments (Web Service for Next.js app, existing PostgreSQL database)
- [ ] Configure custom domain `crashmap.io` in Render and set up DNS records
- [ ] Configure Render auto-deploy from your GitHub repo's `main` branch
- [ ] Set up CI/CD pipeline (GitHub Actions):
  - Lint → Type check → Test → Codegen → Build → Deploy
- [ ] Configure basic monitoring (Sentry for errors, Lighthouse CI for web vitals)
- [ ] Add a health check endpoint (e.g. `GET /api/health` returning `200 OK`) and set **Health Check Path** to `/api/health` in Render web service settings → Health & Alerts

**Deliverables:** Deployed, public-facing production application

### Phase 5: Iteration (Ongoing)

- [ ] Gather user feedback and iterate on visualizations
- [ ] **Stretch goal: Dashboard charts** (see Section 11) — add Recharts/D3 visualizations for severity, mode, time trends, and geographic breakdowns
- [ ] **Stretch goal: Mobile bottom sheet** (see Section 11) — upgrade from full-screen overlay using `vaul` or `react-modal-sheet` for peek/half/full snap states
- [ ] **Stretch goal: Light/Dark mode** (see Section 11) — swap Mapbox basemap, chart themes, and UI via CSS custom properties
- [ ] Add comparative analysis features (year-over-year, area comparison)
- [ ] Add an admin interface for uploading new crash data (protected with NextAuth.js)
- [ ] Monitor query performance — add materialized views only if aggregation queries become slow
- [ ] If data grows beyond 50K rows or traffic increases, revisit the caching strategy

---
