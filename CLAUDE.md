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
- **ORM:** Prisma (use `prisma db pull` to introspect existing table — do NOT use `prisma migrate dev`)
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
- `MostSevereInjuryType` values include: Death, Serious Injury, Minor Injury, None/Unknown
- Prisma model uses `@map` decorators to map camelCase TS properties to the existing PascalCase column names
- A generated PostGIS `geom` column should be added for spatial queries (see ARCHITECTURE.md Section 3)

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

| Filter | shadcn/ui Component | DB Column |
|---|---|---|
| Date Range / Year | `Popover` + `Calendar` + `Button` (4 year quick-select buttons) | `CrashDate` |
| State | `Select` | `StateOrProvinceName` |
| County (cascading from State) | `Select` | `CountyName` |
| City (cascading from County) | `Select` | `CityName` |
| Mode | `ToggleGroup` | `Mode` |
| Injury Severity (multi-select) | `Checkbox` + `Label` | `MostSevereInjuryType` |

- None/Unknown injuries are **hidden by default** but can be toggled on
- Cascading dropdowns powered by a `filter_metadata` materialized view
- Year buttons show most recent 4 years as one-click shortcuts

### Map Icon Design
Severity-based visual hierarchy using color, opacity, AND size:

| Severity | Color | Opacity | Base Size |
|---|---|---|---|
| Death | `#B71C1C` (dark red) | 85% | 8px |
| Serious Injury | `#E65100` (orange) | 70% | 7px |
| Minor Injury | `#F9A825` (yellow) | 55% | 6px |
| None/Unknown | `#C5E1A5` (pale yellow-green) | 50% | 5px |

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

## Key Files
- `ARCHITECTURE.md` — Full architecture document with data model, GraphQL schema, Prisma model, SQL indexes, action plan, and all technical details
- Prisma schema should use `@@map("crashdata")` and `@map("ColumnName")` for each field

## What's Done
- [x] Domain purchased (crashmap.io)
- [x] Next.js project created
- [x] Render Professional plan (web service)
- [x] Render Basic PostgreSQL (5GB) with data loaded
- [x] Architecture document complete

## What's Next (Phase 1 remaining)
- [ ] Initialize Tailwind CSS and shadcn/ui (`npx shadcn-ui@latest init`)
- [ ] Enable PostGIS on Render database (`CREATE EXTENSION postgis;`)
- [ ] Run `prisma db pull` to introspect the existing `crashdata` table
- [ ] Add generated `geom` column and create indexes (see ARCHITECTURE.md Section 3)
- [x] Verify `FullDate` format and add `CrashDate` DATE column with index
- [ ] Set up ESLint, Prettier, Husky pre-commit hooks
