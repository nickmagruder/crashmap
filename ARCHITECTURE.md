# CrashMap — Full-Stack Architecture Guide

> **CrashMap** is a public-facing web application for visualizing crash data involving injuries and fatalities to **bicyclists and pedestrians**. The data is self-collected and stored in a single PostgreSQL table on Render.

## Summary

**CrashMap's** stack — **Next.js + React + Apollo Server + GraphQL + Prisma + PostgreSQL/PostGIS + Mapbox**, all hosted on **Render** — is well-suited for a public-facing bicyclist and pedestrian crash visualization app at your scale (thousands to tens of thousands of rows, low daily traffic). The key principles for your project:

1. **Keep it simple.** A three-tier monolithic deployment — single Next.js app serving both the React frontend and GraphQL API, backed by one PostgreSQL table. No microservices, no Redis, no DataLoader, no complex auth. Add complexity only when measurements justify it.
2. **PostGIS** for spatial queries — essential for mapping crash locations, and it handles your scale trivially.
3. **Mapbox GL JS** with severity-based color/opacity gradient (dark red → orange → yellow → pale green) makes crash severity instantly readable, with subtle stroke differentiation for bicyclist vs. pedestrian.
4. **Apollo Client's InMemoryCache** is your only caching layer — it's sufficient for low-traffic apps.
5. **`prisma db pull`** to map your existing schema rather than migrating from scratch — work with the table you have.

Start with Phase 1, verify PostGIS works on your Render database, validate the Prisma model against your real data, and build from there.

## 1. Overall Architecture

### High-Level Architecture Diagram

CrashMap follows a **classic three-tier architecture** (Client → Server → Data) deployed as a single Next.js application on Render. The **client tier** handles rendering and UI state via React, Apollo Client, and Mapbox GL JS. The **server tier** is a GraphQL API (Apollo Server) embedded in a Next.js API route, keeping deployment unified and eliminating cross-origin concerns. The **data tier** is a single PostgreSQL + PostGIS database. Because the entire dataset is small (thousands to tens of thousands of rows in one table), the architecture intentionally avoids microservices, caching layers, and serverless functions in favor of a straightforward monolithic deployment where a persistent Node.js process serves both the frontend and API.

```text
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT TIER                          │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              Next.js Frontend (React)                │   │
│   │  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  │   │
│   │  │ Map View │  │ Dashboard │  │ Filters/Search   │  │   │
│   │  │(Mapbox   │  │(Recharts  │  │ (shadcn/ui +     │  │   │
│   │  │ GL JS +  │  │ / D3)     │  │  React Context)  │  │   │
│   │  │react-map-│  │ *stretch* │  │                  │  │   │
│   │  │  gl)     │  │ *goal*    │  │                  │  │   │
│   │  └──────────┘  └───────────┘  └──────────────────┘  │   │
│   │                                                      │   │
│   │  Apollo Client  ←→  In-Memory Cache                  │   │
│   └──────────────────────┬──────────────────────────────┘   │
│                          │ GraphQL Queries                   │
└──────────────────────────┼──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                     SERVER TIER                              │
│                          │                                   │
│   ┌──────────────────────▼──────────────────────────────┐   │
│   │       Next.js API Route: /api/graphql                │   │
│   │       (Apollo Server)                                │   │
│   │                                                      │   │
│   │  ┌────────────┐  ┌─────────────────────────────┐     │   │
│   │  │ Resolvers  │  │ Lightweight Auth / Rate      │     │   │
│   │  │            │  │ Limiting (if needed later)   │     │   │
│   │  └──────┬─────┘  └─────────────────────────────┘     │   │
│   │         │                                             │   │
│   │  ┌──────▼──────────────────────┐                      │   │
│   │  │     Prisma ORM              │                      │   │
│   │  │  (Type-safe DB access)      │                      │   │
│   │  └──────────────┬──────────────┘                      │   │
│   └─────────────────┼───────────────────────────────────┘   │
│                     │                                        │
└─────────────────────┼────────────────────────────────────────┘
                      │
┌─────────────────────┼────────────────────────────────────────┐
│                 DATA TIER                                     │
│                     │                                         │
│   ┌─────────────────▼─────────────────┐                      │
│   │  PostgreSQL + PostGIS             │                      │
│   │  - crashdata (single table)       │                      │
│   │  - geospatial index (GIST)        │                      │
│   │  - standard B-tree indexes        │                      │
│   └───────────────────────────────────┘                      │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User Interaction →** React components capture filter selections from the toggle panel (date range, state, county, city, severity, mode)
2. **GraphQL Query →** Apollo Client sends a query with variables to `/api/graphql`
3. **Cache Check →** Apollo Client checks its in-memory cache first; serves from cache if fresh
4. **Resolution →** Apollo Server resolvers call Prisma ORM to build the database query
5. **Database Query →** Prisma generates optimized SQL against the `crashdata` table, with PostGIS spatial queries on the `Latitude`/`Longitude` columns
6. **Response →** Data flows back through resolvers → Apollo Client cache → React components re-render
7. **Visualization →** Mapbox map renders using the cached/normalized data (dashboard charts too, if implemented)

### Component Interaction Details

#### Frontend (React + Next.js)

- **Next.js App Router** handles SSR/SSG for SEO-friendly pages and fast initial loads
- **Apollo Client** manages GraphQL state, caching, and optimistic updates
- **shadcn/ui** provides the component library (Select, Checkbox, Button, Sheet, DatePicker, Popover) styled with Tailwind CSS. Components are copied into the project for full ownership and customization — critical for overlay/sidebar controls that sit on top of the Mapbox canvas.
- **Mapbox GL JS** (via `react-map-gl`) powers the map with WebGL rendering. If the dashboard stretch goal is implemented, Recharts/D3 handle charts. Both bind directly to Apollo cache data.
- **React Context** for local UI state (filter selections, view preferences, sidebar open/closed)

#### API Layer (Apollo Server in Next.js)

- Single `/api/graphql` endpoint handles all data queries
- Resolvers are thin — they delegate to a service layer that uses Prisma
- Since you have a single table, resolvers will be straightforward with no complex joins or N+1 concerns

#### Data Layer (PostgreSQL + PostGIS on Render)

- **PostGIS** extension enables spatial queries (e.g., "all pedestrian crashes within 5km of downtown")
- **Prisma ORM** provides type-safe database access with migration support
- Single `crashdata` table keeps things simple — at tens of thousands of rows, PostgreSQL handles this comfortably without any caching layer

---

## 2. API Layer Technologies

### Primary Recommendation: Apollo Server with Next.js API Routes

Given your stack (PostgreSQL, TypeScript, React, GraphQL, Next.js), **Apollo Server** integrated into **Next.js API Routes** is the strongest choice. This gives you a unified deployment, TypeScript-native development, and a mature GraphQL ecosystem.

**Why Apollo Server?**

- First-class TypeScript support with automatic type generation via `graphql-codegen`
- Seamless integration with Next.js via the `/app/api/graphql` route handler
- Built-in caching, batching, and performance tracing (Apollo Studio)
- Huge community and ecosystem (DataLoaders, federation support)
- Works naturally with the Apollo Client you'll use on the React frontend

**Alternative Options Considered:**

| Technology | Pros | Cons | Best For |
| --- | --- | --- | --- |
| **Apollo Server** (recommended) | Mature ecosystem, great DX, built-in tracing | Heavier bundle than alternatives | Production apps needing observability |
| **Yoga (by The Guild)** | Lightweight, spec-compliant, plugin system | Smaller community than Apollo | Teams wanting minimal footprint |
| **Pothos + Yoga** | Code-first schema, excellent TS inference | Steeper learning curve | Teams that dislike SDL-first schemas |
| **tRPC** | End-to-end type safety, zero schema | Not GraphQL (trade-off) | Teams willing to drop GraphQL |
| **Hasura** | Instant GraphQL from Postgres, subscriptions | Less control over resolver logic | Rapid prototyping, real-time needs |

---

## 3. Data Model

### Existing PostgreSQL Schema

```sql
CREATE TABLE public.crashdata
(
    "ColliRptNum" text NOT NULL,          -- Collision report number (primary key)
    "Jurisdiction" text,                   -- Reporting jurisdiction
    "StateOrProvinceName" text,            -- State / province
    "RegionName" text,                     -- Region
    "CountyName" text,                     -- County
    "CityName" text,                       -- City
    "FullDate" text,                       -- Date as text (consider casting to DATE for queries)
    "FullTime" text,                       -- Time as text
    "MostSevereInjuryType" text,           -- Injury severity (e.g., fatal, serious, minor)
    "AgeGroup" text,                       -- Age group of involved person
    "InvolvedPersons" smallint,            -- Number of persons involved
    "CrashStatePlaneX" real,               -- State plane X coordinate
    "CrashStatePlaneY" real,               -- State plane Y coordinate
    "Latitude" double precision,           -- GPS latitude (used for Mapbox)
    "Longitude" double precision,          -- GPS longitude (used for Mapbox)
    "Mode" text,                           -- "Bicyclist" or "Pedestrian"
    "CrashDate" date,                      -- Proper DATE column derived from FullDate
    PRIMARY KEY ("ColliRptNum")
);
```

### Recommended Indexes

These indexes cover the most common CrashMap query patterns — filtering by date, severity, mode, geography, and location name:

```sql
-- Spatial index for bounding-box and radius queries (requires PostGIS)
-- Option A: Create a generated geometry column and index it
ALTER TABLE public.crashdata
  ADD COLUMN geom geometry(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("Longitude", "Latitude"), 4326)) STORED;
CREATE INDEX idx_crashdata_geom ON public.crashdata USING GIST (geom);

-- Option B: If you prefer not to add a column, index the raw lat/lng
-- (less efficient for spatial queries but simpler)
CREATE INDEX idx_crashdata_lat_lng ON public.crashdata ("Latitude", "Longitude");

-- Filter indexes (idx_crashdata_date on "CrashDate" already exists)
-- CREATE INDEX idx_crashdata_date ON public.crashdata ("CrashDate");
CREATE INDEX idx_crashdata_severity ON public.crashdata ("MostSevereInjuryType");
CREATE INDEX idx_crashdata_mode ON public.crashdata ("Mode");
CREATE INDEX idx_crashdata_state ON public.crashdata ("StateOrProvinceName");
CREATE INDEX idx_crashdata_county ON public.crashdata ("CountyName");
CREATE INDEX idx_crashdata_city ON public.crashdata ("CityName");
```

> **Note on date columns:** `FullDate` stores the original ISO 8601 text values (`2025-02-23T00:00:00`). The `CrashDate` column is a proper `DATE` type derived from `FullDate` and should be used for all date-range queries and filtering. An index (`idx_crashdata_date`) exists on `CrashDate`.

### Prisma Model

Map the existing table using Prisma's `@@map` and `@map` to preserve the existing column names while using idiomatic TypeScript property names:

```prisma
// schema.prisma
model CrashData {
  colliRptNum         String   @id @map("ColliRptNum")
  jurisdiction        String?  @map("Jurisdiction")
  stateOrProvinceName String?  @map("StateOrProvinceName")
  regionName          String?  @map("RegionName")
  countyName          String?  @map("CountyName")
  cityName            String?  @map("CityName")
  fullDate            String?  @map("FullDate")
  fullTime            String?  @map("FullTime")
  mostSevereInjury    String?  @map("MostSevereInjuryType")
  ageGroup            String?  @map("AgeGroup")
  involvedPersons     Int?     @map("InvolvedPersons") @db.SmallInt
  crashStatePlaneX    Float?   @map("CrashStatePlaneX") @db.Real
  crashStatePlaneY    Float?   @map("CrashStatePlaneY") @db.Real
  latitude            Float?   @map("Latitude")
  longitude           Float?   @map("Longitude")
  mode                String?  @map("Mode")
  crashDate           DateTime? @map("CrashDate") @db.Date

  @@map("crashdata")
}
```

> **Important:** Since this table already exists, use `prisma db pull` to introspect the database rather than `prisma migrate dev` to avoid conflicts. You can then refine the generated model above.

### GraphQL Type

```graphql
type Crash {
  colliRptNum: ID!
  jurisdiction: String
  state: String
  region: String
  county: String
  city: String
  date: String               # Original FullDate text
  crashDate: String           # Proper DATE column (YYYY-MM-DD)
  time: String
  severity: String            # Maps to MostSevereInjuryType
  ageGroup: String
  involvedPersons: Int
  latitude: Float
  longitude: Float
  mode: String                # "Bicyclist" or "Pedestrian"
}

input CrashFilter {
  severity: [String]           # Array for multi-select: ["Death", "Serious Injury"]
  mode: String                 # "Bicyclist" or "Pedestrian"
  state: String
  county: String
  city: String
  dateFrom: String             # e.g., "2023-01-01"
  dateTo: String               # e.g., "2025-12-31"
  year: String                 # Shortcut: "2024" (alternative to dateFrom/dateTo)
  bbox: BBoxInput              # For map viewport queries
  includeNoInjury: Boolean     # Default false — opt-in for None/Unknown
}

input BBoxInput {
  minLat: Float!
  minLng: Float!
  maxLat: Float!
  maxLng: Float!
}

type CrashResult {
  items: [Crash!]!
  totalCount: Int!
}

type CrashStats {
  totalCrashes: Int!
  totalFatal: Int!
  byMode: [ModeStat!]!
  bySeverity: [SeverityStat!]!
  byCounty: [CountyStat!]!
}

type Query {
  crashes(filter: CrashFilter, limit: Int = 50, offset: Int = 0): CrashResult!
  crash(colliRptNum: ID!): Crash
  crashStats(filter: CrashFilter): CrashStats!
}
```

---

## 4. MVP Features

### Filters

CrashMap's filter panel allows users to narrow the displayed crash data. All filters are combinable (AND logic) and update the map in real time. If the dashboard stretch goal is implemented, filters will update charts simultaneously.

| Filter | Control Type | shadcn/ui Component | Maps To Column | Notes |
| --- | --- | --- | --- | --- |
| **Date Range / Year** | Date range picker + year quick-select buttons | `DatePicker` (or `Popover` + `Calendar`) + `Button` | `FullDate` | Default: all dates. Show ~4 buttons for most recent years (e.g., 2025, 2024, 2023, 2022) alongside a date range picker for custom ranges. Year buttons act as one-click shortcuts that set the range to Jan 1–Dec 31 of that year. |
| **State** | Dropdown (single-select) | `Select` | `StateOrProvinceName` | Default: all states. |
| **County** | Dropdown (single-select, filtered by selected state) | `Select` | `CountyName` | Cascading: only shows counties within the selected state. |
| **City** | Dropdown (single-select, filtered by selected county) | `Select` | `CityName` | Cascading: only shows cities within the selected county. |
| **Mode** | Toggle / segmented control | `ToggleGroup` | `Mode` | Options: Bicyclist / Pedestrian / All. Default: All. |
| **Injury Severity** | Multi-select checkboxes | `Checkbox` + `Label` | `MostSevereInjuryType` | Options: Death, Serious Injury, Minor Injury, None/Unknown. Default: Death + Serious + Minor (None/Unknown hidden by default but can be toggled on). |

**Cascading dropdowns:** State → County → City should filter progressively. This requires either client-side filtering of a metadata lookup or a lightweight query. See the metadata view below.

### Filter Metadata View

To efficiently populate the cascading filter dropdowns without scanning the full `crashdata` table on every load, create a materialized view of distinct filter values:

```sql
CREATE MATERIALIZED VIEW filter_metadata AS
SELECT DISTINCT
    "StateOrProvinceName" AS state,
    "CountyName" AS county,
    "CityName" AS city
FROM public.crashdata
WHERE "StateOrProvinceName" IS NOT NULL
ORDER BY state, county, city;

-- Also useful: distinct years for the year dropdown
CREATE MATERIALIZED VIEW available_years AS
SELECT DISTINCT
    EXTRACT(YEAR FROM "CrashDate")::int AS year
FROM public.crashdata
WHERE "CrashDate" IS NOT NULL
ORDER BY year DESC;

-- Refresh after data imports
REFRESH MATERIALIZED VIEW filter_metadata;
REFRESH MATERIALIZED VIEW available_years;
```

Add a corresponding GraphQL query to load filter options on app initialization:

```graphql
type FilterOptions {
  states: [String!]!
  counties(state: String): [String!]!
  cities(state: String, county: String): [String!]!
  years: [String!]!
  severities: [String!]!
  modes: [String!]!
}

type Query {
  filterOptions: FilterOptions!
  # ... existing queries
}
```

### Map Icon Design

Crash points use a **severity-based color and opacity gradient** on the Mapbox circle layer. Bicyclist and pedestrian icons use slightly different hues but follow the same gradient system.

| Severity | Color | Opacity | Size (base) | Default Visibility |
| --- | --- | --- | --- | --- |
| **Death** | Dark Red (`#B71C1C`) | ~85% | 8px | ✅ Shown |
| **Serious Injury** | Orange (`#E65100`) | ~70% | 7px | ✅ Shown |
| **Minor Injury** | Yellow (`#F9A825`) | ~55% | 6px | ✅ Shown |
| **None / Unknown** | Pale Yellow-Green (`#C5E1A5`) | ~50% | 5px | ❌ Hidden by default |

**Mapbox implementation** using data-driven styling:

```javascript
// Circle layer with severity-based color, opacity, and size + zoom scaling
map.addLayer({
  id: 'crash-points',
  type: 'circle',
  source: 'crashes',
  paint: {
    // Size: scales by severity AND zoom level
    'circle-radius': [
      'interpolate', ['linear'], ['zoom'],
      // At zoom 4 (state-level): small base sizes
      4, ['match', ['get', 'severity'],
        'Death',          3,
        'Serious Injury', 2.5,
        'Minor Injury',   2,
        /* None/Unknown */ 1.5
      ],
      // At zoom 10 (city-level): medium sizes
      10, ['match', ['get', 'severity'],
        'Death',          8,
        'Serious Injury', 7,
        'Minor Injury',   6,
        /* None/Unknown */ 5
      ],
      // At zoom 16 (street-level): large sizes
      16, ['match', ['get', 'severity'],
        'Death',          14,
        'Serious Injury', 12,
        'Minor Injury',   10,
        /* None/Unknown */ 8
      ]
    ],
    'circle-color': [
      'match', ['get', 'severity'],
      'Death',          '#B71C1C',
      'Serious Injury', '#E65100',
      'Minor Injury',   '#F9A825',
      /* None/Unknown */ '#C5E1A5'
    ],
    'circle-opacity': [
      'match', ['get', 'severity'],
      'Death',          0.85,
      'Serious Injury', 0.70,
      'Minor Injury',   0.55,
      /* None/Unknown */ 0.50
    ],
    // Slight hue shift for mode differentiation
    'circle-stroke-color': [
      'match', ['get', 'mode'],
      'Bicyclist',  '#1565C0',   // Blue stroke for bicyclists
      'Pedestrian', '#4A148C',   // Purple stroke for pedestrians
      '#666666'
    ],
    'circle-stroke-width': [
      'interpolate', ['linear'], ['zoom'],
      4, 0.5,     // Thin stroke when zoomed out
      10, 1.5,    // Medium stroke at city level
      16, 2.5     // Thicker stroke at street level
    ]
  },
  // Filter out None/Unknown by default
  filter: ['in', 'severity', 'Death', 'Serious Injury', 'Minor Injury']
});
```

> **Zoom-level scaling:** The `interpolate` expression smoothly scales circle radius between zoom stops, so icons grow continuously as the user zooms in — not in abrupt jumps. At state-level zoom (~4), deaths are 3px and minor injuries are 2px; at street-level zoom (~16), deaths are 14px and minor injuries are 10px. Tune these values based on your data density.
>
> **Severity sizing rationale:** Larger circles for more severe crashes ensures that fatalities remain visually prominent even in dense clusters, while minor injuries recede. Combined with the color/opacity gradient, this creates a clear visual hierarchy: deaths are large, dark red, and opaque; minor injuries are small, yellow, and semi-transparent.

### UI Layout — Mobile-First, Full-Viewport Map

CrashMap uses a **mobile-first** design where the map is always the primary element, filling the entire viewport. Filters and controls are secondary and toggle in/out to maximize map real estate.

**Mobile (< 768px):**

```text
┌──────────────────────────┐
│  ┌──┐         ┌────────┐ │
│  │☰ │         │ Legend  │ │  ← Floating controls overlaid on map
│  └──┘         └────────┘ │
│                          │
│                          │
│      Full-Viewport Map   │
│                          │
│                          │
│                          │
│  ┌────────────────────┐  │
│  │ Summary Bar        │  │  ← Persistent: crash count, active filters
│  └────────────────────┘  │
└──────────────────────────┘

        ☰ tapped ↓

┌──────────────────────────┐
│ ┌──────────────────────┐ │
│ │  ✕  Filters          │ │  ← Full-screen overlay or bottom sheet
│ │                      │ │
│ │  [2025][2024][2023]  │ │
│ │  [2022]              │ │  ← Year quick-select buttons
│ │  Date Range: ▾ — ▾   │ │  ← Custom range picker
│ │  State ▾             │ │
│ │  County ▾            │ │
│ │  City ▾              │ │
│ │  Mode: 🚲 🚶 All    │ │
│ │  Severity: ☑☑☑☐     │ │
│ │                      │ │
│ │  [ Apply Filters ]   │ │
│ └──────────────────────┘ │
└──────────────────────────┘
```

**Desktop (≥ 768px):**

```text
┌─────────────────────────────────────────────────────┐
│  ┌──┐                                    ┌────┐    │
│  │☰ │                                    │ ⚙  │    │  ← Toggle button
│  └──┘                                    └────┘    │
│                                                     │
│                                                     │
│              Full-Viewport Map                      │
│                                                     │
│                                                     │
│                                                     │
│                                                     │
└─────────────────────────────────────────────────────┘

        ⚙ clicked ↓

┌─────────────────────────────────────┬───────────────┐
│                                     │  ✕  Filters   │
│                                     │               │
│                                     │ [25][24][23]  │
│           Map (resized)             │ [22]          │
│                                     │ Range: ▾ — ▾  │
│                                     │ State ▾       │
│                                     │ County ▾      │
│                                     │ City ▾        │
│                                     │ Mode: 🚲🚶All│
│                                     │ Severity:     │
│                                     │  ☑☑☑☐        │
│                                     │               │
└─────────────────────────────────────┴───────────────┘
```

**Implementation notes:**

- The map container should always be `width: 100vw; height: 100vh` (or `100dvh` on mobile to account for browser chrome). When the desktop sidebar opens, the map resizes — call `map.resize()` after the transition to avoid rendering artifacts.
- **Desktop sidebar:** Use shadcn/ui's `Sheet` component (side="right") for the toggleable filter panel. It handles the slide-in animation, overlay backdrop, and close-on-escape out of the box.
- **Mobile overlay:** Use shadcn/ui's `Dialog` (fullscreen variant) or `Sheet` (side="bottom", full height) for the mobile filter panel. Both manage focus trapping and scroll locking.
- The **summary bar** (persistent on mobile) shows the current crash count and active filter chips (shadcn/ui `Badge` components) so users always know what they're looking at without opening the filter panel.
- All floating controls (menu button, legend, zoom) should use `pointer-events: auto` on a container with `pointer-events: none` so they don't block map interactions. Use shadcn/ui `Button` with `variant="outline"` or `variant="secondary"` for floating map controls to maintain visual consistency.
- Mapbox's built-in navigation controls (`NavigationControl`) and attribution should be repositioned to avoid overlapping your custom controls.

**Responsive breakpoints:**

| Breakpoint | Layout | Filter Panel |
| --- | --- | --- |
| < 768px (mobile) | Full-viewport map, floating overlay controls | Full-screen overlay (MVP); bottom sheet (Section 11 stretch goal) |
| ≥ 768px (tablet/desktop) | Full-viewport map, toggleable right sidebar (~320px) | Right column, pushes or overlays map |

---

## 5. Scalability & Performance

> **Context:** Your dataset starts at a few thousand rows in a single table and may grow to tens of thousands. Daily active users will be low. This is a comfortable scale for PostgreSQL — the focus should be on clean indexes and efficient queries, not heavy caching infrastructure.

### Query Efficiency

- **PostGIS GIST Indexes:** If you add the generated `geom` column (recommended in Section 3), a GIST index on it enables fast geo-queries. Even at tens of thousands of rows, this ensures sub-millisecond spatial lookups. See the full index recommendations in Section 3 above.

- **Single Table = Simple Queries:** With one table and no joins, you avoid N+1 problems entirely. No DataLoader needed. Prisma's generated SQL will be straightforward `SELECT ... WHERE` with filters.

- **Offset-Based Pagination is Fine:** At tens of thousands of rows, simple `LIMIT`/`OFFSET` pagination works well. Cursor-based pagination is an optimization you can add later if the dataset grows significantly.

  ```graphql
  type Query {
    crashes(filter: CrashFilter, limit: Int = 50, offset: Int = 0): CrashResult!
  }

  type CrashResult {
    items: [Crash!]!
    totalCount: Int!
  }
  ```

- **Query Complexity Limiting:** Still worth adding `graphql-query-complexity` as a lightweight guard against abuse, since this is a public-facing app.

### Caching Strategy

At your scale, you don't need Redis or a multi-tier caching setup. Keep it simple:

| Layer | Technology | What to Cache | Notes |
| --- | --- | --- | --- |
| **Client** | Apollo Client InMemoryCache | Query results, normalized entities | This is your primary cache — handles repeat queries automatically |
| **CDN/Edge** | Render's built-in CDN | Static pages (landing, about) | Included with your Professional plan |
| **Database** | Standard PostgreSQL query cache | Recent query plans | Built-in, no configuration needed |

**When to add more caching:** If you notice specific aggregation queries (e.g., dashboard summary stats) taking >500ms, create a PostgreSQL **materialized view** for those aggregations:

```sql
-- Only add this if/when dashboard queries become slow
CREATE MATERIALIZED VIEW crash_monthly_summary AS
SELECT
  TO_CHAR("CrashDate", 'YYYY-MM') AS month,
  "MostSevereInjuryType" AS severity,
  "Mode" AS mode,
  "CountyName" AS county,
  COUNT(*) AS total_crashes
FROM public.crashdata
GROUP BY 1, 2, 3, 4;

-- Refresh after data imports
REFRESH MATERIALIZED VIEW crash_monthly_summary;
```

**You do NOT need Redis, CDN query caching, or connection pooling (PgBouncer) at this scale.** These are optimizations for high-traffic apps with millions of rows. Add them only if concrete performance measurements justify it.

### Mapbox Performance Optimization

Even with tens of thousands of points, Mapbox GL JS handles rendering well thanks to WebGL. Key optimizations:

- **Built-in Clustering:** Enable Mapbox's GPU-accelerated clustering on your GeoJSON source to keep the map readable at low zoom levels:

  ```javascript
  map.addSource('crashes', {
    type: 'geojson',
    data: crashGeoJSON,
    cluster: true,
    clusterRadius: 50,
    clusterMaxZoom: 14
  });
  ```

- **Layer Zoom Rules:** Use `minzoom` and `maxzoom` on layers to show heatmaps at low zoom and individual points at high zoom.

- **Viewport-Based Queries (optional):** At tens of thousands of rows, you can likely load the full dataset as GeoJSON and let Mapbox handle it client-side. If performance feels sluggish, switch to viewport-based queries:

  ```graphql
  query CrashesInView($bbox: BBoxInput!) {
    crashesInBoundingBox(bbox: $bbox) {
      id
      latitude
      longitude
      severity
    }
  }
  ```

- **Vector Tiles: Not Needed Yet.** Tools like `tippecanoe` and Mapbox Tiling Service are for datasets with hundreds of thousands to millions of points. You won't need them at your current scale.

---

## 6. Security Best Practices

### Authentication & Authorization

Since this is a public-facing data visualization app with low traffic, you likely don't need user authentication for viewing data. Keep it simple:

- **Public read access:** All crash data queries are open — no login required to view the map
- **Admin access (if needed):** If you have an admin interface for uploading/editing crash data, protect it with **NextAuth.js** using a single admin account or OAuth provider
- **API key (optional):** If you want to track API usage or prevent scraping, add a lightweight API key check rather than full user auth

### Data Protection

- **Input Validation:** Use `zod` schemas to validate all GraphQL inputs before they reach resolvers
- **Rate Limiting:** Add basic rate limiting middleware (e.g., `graphql-rate-limit`) to prevent abuse on the public API — a simple in-memory limiter is fine at low traffic
- **SQL Injection Prevention:** Prisma parameterizes all queries by default — never use raw SQL with user input
- **Query Depth Limiting:** Cap at 5–7 levels to prevent recursive abuse on the public endpoint

### Compliance Considerations

Since this is your own collected data (not sourced from a third-party API with usage restrictions):

- **PII Handling:** Your current schema does not include victim names or addresses, which is good for a public-facing app. The `AgeGroup` field (rather than exact age) is already appropriately anonymized. If you later add fields with PII, exclude them from the public GraphQL schema.
- **Data Accuracy Disclaimer:** Public-facing crash data apps should include a disclaimer about data accuracy, completeness, and intended use — especially important when the data represents injuries and fatalities.
- **Sensitive Content:** Since this data involves injuries and deaths to vulnerable road users (bicyclists and pedestrians), consider adding contextual resources (e.g., links to pedestrian/bicycle safety organizations) alongside the data.
- **Accessibility:** As a public app, aim for WCAG 2.1 AA compliance — this is especially important for safety-related data tools.

### Mapbox-Specific Security

- **Token Scoping:** Create a separate Mapbox access token for your frontend with restricted scopes (only `styles:read`, `fonts:read`, `datasets:read`). Never use your secret admin token client-side.
- **URL Restrictions:** In the Mapbox dashboard, restrict your public token to `crashmap.io` (and your Render subdomain for staging) to prevent unauthorized usage.
- **Usage Monitoring:** Set up Mapbox usage alerts to detect token abuse or unexpected spikes that could inflate costs.
- **Token Rotation:** Store the token as `NEXT_PUBLIC_MAPBOX_TOKEN` in environment variables. Rotate periodically and after any suspected leak.

### Infrastructure Security

- Store secrets in environment variables managed by your hosting platform (Vercel, AWS SSM, etc.)
- Enable PostgreSQL SSL connections (`sslmode=require`)
- Use Content Security Policy headers in Next.js (`next.config.js`)
- Set `output: 'standalone'` in `next.config.js` for optimal Render deployment
- Set up Dependabot or Snyk for dependency vulnerability scanning

---

## 7. Potential Challenges

### Development Challenges

| Challenge | Mitigation |
| --- | --- |
| **GraphQL schema design for geospatial data** | Use custom scalar types for coordinates; define clear `GeoJSON` types. Test with PostGIS early. |
| **N+1 query problems** | Not a concern with a single table. If you later add related tables (vehicles, injuries), adopt DataLoader at that point. |
| **Rendering tens of thousands of points on map** | Mapbox GL JS handles this natively with WebGL. Enable built-in clustering (`cluster: true`) and use zoom-level layer switching. Vector tiles and server-side clustering are not needed at this scale. |
| **TypeScript type synchronization** | Use `graphql-codegen` to auto-generate types from your schema. Run codegen in CI. |
| **Schema evolution without breaking clients** | Follow GraphQL deprecation patterns; never remove fields — deprecate then remove after migration window. |

### Deployment Challenges

| Challenge | Mitigation |
| --- | --- |
| **PostGIS on managed hosting** | Use Supabase (built-in PostGIS), Neon, or AWS RDS. Verify spatial extension availability before committing. |
| **Cold starts** | Not an issue — your Professional plan keeps web services running continuously with no spin-down. |
| **Database migrations in production** | Use Prisma Migrate with a CI/CD pipeline. Always test migrations against a staging copy of production data. |
| **CORS and API security** | Configure Apollo Server CORS to only allow your domain (`https://crashmap.io` and the Render subdomain). Use CSRF tokens for mutations. |

### Render-Specific Considerations

You're on Render's **Professional plan** (web services) with the **Basic PostgreSQL plan** (5GB storage). Here are platform-specific notes:

**Advantages of all-on-Render:**

- **No spin-down:** Professional plan keeps your web service running 24/7 — no cold starts, no UptimeRobot hacks needed. This eliminates the biggest UX problem low-traffic apps face on Render.
- **Persistent database:** Basic plan with 5GB storage has no expiration. At your data scale (tens of thousands of rows with text and coordinate fields), 5GB is more than sufficient — you'd need hundreds of thousands of rows before storage becomes a concern. Back up regularly with `pg_dump` as standard practice.
- **Internal networking:** Render services in the same region can communicate over a private network, meaning your Next.js app connects to PostgreSQL with minimal latency and no public internet exposure. Use the internal database URL (`postgresql://...@dpg-xxx-a.oregon-postgres.render.com/...`) rather than the external one.
- **Simplified deployment:** One platform for all services, one dashboard to monitor, one billing account. Auto-deploy from GitHub works well.
- **Environment variable management:** Render's environment groups let you share variables (like `DATABASE_URL`) across services.

**Potential issues to watch for:**

| Issue | Details | Mitigation |
| --- | --- | --- |
| **PostGIS availability** | Render's managed PostgreSQL supports PostGIS, but you need to manually enable it: `CREATE EXTENSION postgis;` via a direct connection. Verify this works early in Phase 1. | Test PostGIS immediately after provisioning the database. |
| **No edge/serverless functions** | Unlike Vercel, Render runs your Next.js app as a standard Node.js server, not serverless. This actually *helps* you — persistent database connections, no Prisma serverless overhead, no cold starts. | Run Next.js in standalone mode: set `output: 'standalone'` in `next.config.js` for optimal Docker builds on Render. |
| **Build times** | Next.js + Prisma generate + codegen can be slow. | Cache `node_modules` and Prisma client in Render's build settings. Use `npm ci` instead of `npm install`. |
| **No built-in analytics** | Render doesn't include web analytics like Vercel Analytics. | Add Plausible, Fathom, or a self-hosted analytics solution. Or just rely on Lighthouse CI in your CI/CD pipeline for performance tracking. |

### Testing Challenges

| Challenge | Mitigation |
| --- | --- |
| **Testing GraphQL resolvers** | Use `apollo-server-testing` or `graphql-yoga`'s test utilities with in-memory Prisma (or test containers). |
| **Geospatial query testing** | Seed test database with known geometries; assert distance/containment with PostGIS functions. |
| **Performance regression testing** | Use k6 or Artillery for load testing; set query response time budgets (e.g., p95 < 200ms). |
| **Visual regression testing** | Chromatic or Percy for chart snapshots. For Mapbox maps, snapshot testing is unreliable due to WebGL — use integration tests with `@mapbox/mapbox-gl-js-mock` instead. |

---

## 8. Step-by-Step Action Plan

### Phase 1: Foundation (Weeks 1–3)

#### Milestone: Project scaffolding and data model**

- [x] Purchase domain: **crashmap.io** ✓
- [x] Initialize Next.js project with TypeScript (`create-next-app --typescript`)
- [x] Initialize Tailwind CSS and shadcn/ui (`npx shadcn-ui@latest init`)
- [x] Set up PostgreSQL with PostGIS extension on your existing Render database (`CREATE EXTENSION postgis;`)
- [ ] Run `prisma db pull` to introspect your existing `crashdata` table, then refine the generated Prisma model (see Section 3 for the recommended model)
- [ ] Add the generated `geom` geometry column and create recommended indexes (see Section 3)
- [x] Verify `FullDate` column format (ISO 8601: `2025-02-23T00:00:00`) and add `CrashDate` DATE column with index
- [ ] Validate data: check for null `Latitude`/`Longitude` values, confirm `Mode` values are consistent ("Bicyclist"/"Pedestrian"), check `MostSevereInjuryType` distinct values
- [ ] Create the `filter_metadata` and `available_years` materialized views (see Section 4) for cascading dropdown population
- [ ] Set up ESLint, Prettier, Husky pre-commit hooks

**Deliverables:** Running Next.js app, populated database, Prisma client generated

### Phase 2: API Layer (Weeks 3–5)

#### Milestone: Functional GraphQL API with core queries

- [ ] Install Apollo Server and configure in `/app/api/graphql/route.ts`
- [ ] Define GraphQL schema matching the types in Section 3:
  - Queries: `crashes(filter, limit, offset)`, `crash(colliRptNum)`, `crashStats(filter)`, `filterOptions`
  - Filters: by date/year, state, county, city, mode (Bicyclist/Pedestrian), severity (multi-select), bounding box
  - No mutations needed for public-facing app (add later if you build an admin interface)
- [ ] Implement resolvers with Prisma (single-table queries — straightforward)
- [ ] Set up `graphql-codegen` for automatic TypeScript type generation
- [ ] Implement simple offset-based pagination
- [ ] Add query depth limiting for public API protection
- [ ] Write integration tests for all resolvers

**Deliverables:** Fully tested GraphQL API accessible via Apollo Sandbox

### Phase 3: Frontend Core (Weeks 5–8)

#### Milestone: Interactive map with filters

- [ ] Set up Apollo Client with InMemoryCache and type policies
- [ ] Install shadcn/ui components needed for the UI:
  - `npx shadcn-ui@latest add button select checkbox toggle-group sheet dialog badge popover calendar`
- [ ] Build interactive map component with Mapbox GL JS (`react-map-gl`):
  - GeoJSON source built from `Latitude`/`Longitude` fields
  - Circle layer with severity-based color/opacity gradient (see Section 4 for palette)
  - Stroke color differentiation for bicyclist vs. pedestrian mode
  - None/Unknown injuries hidden by default via Mapbox layer filter
  - Heatmap layer for density visualization at low zoom levels
  - Built-in clustering with `cluster: true` on the GeoJSON source
  - Popup/tooltip on click showing crash details (date, severity, mode, location, age group)
- [ ] Secure Mapbox access token via environment variable (`NEXT_PUBLIC_MAPBOX_TOKEN`)
- [ ] Implement filter panel (see Section 4 for full spec):
  - Date Range: year quick-select buttons (most recent 4 years) + custom date range picker
  - State → County → City cascading dropdowns (powered by `filter_metadata` view)
  - Mode toggle: Bicyclist / Pedestrian / All
  - Severity multi-select: Death, Serious, Minor (None/Unknown opt-in)
- [ ] Load filter options on app init via `filterOptions` GraphQL query
- [ ] Connect filters to GraphQL query variables
- [ ] Implement mobile-first responsive layout (see Section 4 — UI Layout):
  - Full-viewport map as the base layer on all screen sizes
  - Mobile: floating overlay controls + full-screen filter overlay (toggle open/close)
  - Desktop: toggleable right sidebar (~320px) for filters
  - Persistent summary bar showing crash count and active filter chips
  - Call `map.resize()` on sidebar open/close transitions

**Deliverables:** Working app with map and filters

### Phase 4: Security, Polish & Deployment (Weeks 8–10)

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

## 9. Recommended Tools & Resources

### Core Stack Libraries

| Purpose | Library | Why |
| --- | --- | --- |
| GraphQL Server | `@apollo/server` | Mature, well-documented, great tracing |
| ORM | `prisma` | Type-safe, great migrations |
| GraphQL Client | `@apollo/client` | Best cache, React hooks |
| Type Generation | `@graphql-codegen/cli` | Keeps types in sync |
| UI Components | `shadcn/ui` (Radix UI + Tailwind) | Copy-paste ownership, fully customizable, built-in dark mode theming, same author as `vaul` |
| CSS Framework | `tailwindcss` | Utility-first, pairs with shadcn/ui, built into Next.js scaffolding |
| Validation | `zod` | Schema validation + TypeScript inference |
| Auth (if needed) | `next-auth` | Built for Next.js — add when you build admin features |

### Visualization Libraries

| Purpose | Library | Why |
| --- | --- | --- |
| Maps | `react-map-gl` (Mapbox GL JS wrapper) | Your chosen map platform; React-friendly, WebGL-powered |
| Map Clustering | `supercluster` | Fast geospatial point clustering, pairs with Mapbox |
| Map Utilities | `@mapbox/mapbox-gl-geocoder` | Address search / geocoding integration |
| Deck.gl Layers (optional) | `@deck.gl/mapbox` | Overlay advanced viz (e.g., arc layers, 3D) on Mapbox basemap if needed |
| Charts (stretch goal) | `recharts` or `@visx/visx` | React-native, composable |
| Advanced Charts (stretch goal) | `d3` | Maximum flexibility for custom viz |
| Geospatial Utilities | `turf.js` | Client-side spatial operations |

### Development & DevOps

| Purpose | Tool |
| --- | --- |
| Local DB | Docker + `postgis/postgis` image |
| API Playground | Apollo Sandbox (built into Apollo Server) |
| Error Tracking | Sentry |
| CI/CD | GitHub Actions |
| Hosting | Render (app + database — all on one platform) |
| Monitoring | Sentry (errors) + Lighthouse CI (web vitals) |

### Documentation & Learning

- [shadcn/ui Docs](https://ui.shadcn.com/) — component catalog, theming, and dark mode setup
- [Mapbox GL JS Docs](https://docs.mapbox.com/mapbox-gl-js/)
- [react-map-gl Docs](https://visgl.github.io/react-map-gl/)
- [Mapbox Examples Gallery](https://docs.mapbox.com/mapbox-gl-js/examples/) — especially clustering, heatmaps, and data-driven styling
- [Apollo Server Docs](https://www.apollographql.com/docs/apollo-server/)
- [Prisma Docs](https://www.prisma.io/docs)
- [PostGIS Docs](https://postgis.net/documentation/)
- [Next.js App Router Docs](https://nextjs.org/docs/app)
- [GraphQL Best Practices](https://graphql.org/learn/best-practices/)

---

## 10. Evaluating Architecture Effectiveness

### Key Metrics to Track

| Metric | Target | Tool |
| --- | --- | --- |
| **GraphQL query response time (p95)** | < 200ms for filtered queries, < 500ms for full aggregations | Prisma query logging |
| **Time to Interactive (TTI)** | < 3s on 3G | Lighthouse CI |
| **Largest Contentful Paint (LCP)** | < 2.5s | Web Vitals |
| **Map initial render** | < 2s with full dataset loaded | Browser performance marks |
| **Error rate** | < 0.1% | Sentry |

### Evaluation Cadence

Given low daily traffic, a lightweight evaluation approach is appropriate:

- **After deployment:** Run Lighthouse, test all filters, verify map rendering with full dataset
- **Monthly:** Check Sentry for errors, run Lighthouse for any performance regressions
- **After data imports:** Verify query performance hasn't degraded as the dataset grows

### User Feedback Loop

- Embed a lightweight feedback widget (e.g., "Was this data helpful?" with thumbs up/down)
- Track feature usage with analytics (which filters are most used, which views are popular)
- Conduct usability testing with target users after Phase 3
- Monitor search/filter patterns to inform data model and index optimization

---

## 11. Stretch Goals

### Dashboard Charts

Add a data dashboard alongside the map (accessible via a tab or toggle in the sidebar) with summary visualizations built in Recharts or D3:

- Crashes over time (line chart, grouped by mode)
- Severity distribution (bar chart)
- Bicyclist vs. pedestrian breakdown (donut/pie chart)
- Crashes by county or city (horizontal bar)
- Age group distribution (bar chart)

All charts should respond to the same active filters as the map, powered by the `crashStats` GraphQL query. On desktop, charts can live in the sidebar below the filters or in a dedicated tab. On mobile, charts would display in a scrollable section within the filter overlay.

**Libraries:** Use `recharts` for standard chart types (bar, line, pie) — it's React-native and composable. Reach for `d3` only if you need highly custom visualizations. Both are listed in the tools section (Section 9).

### Mobile Bottom Sheet

The MVP uses a full-screen overlay for the mobile filter panel (~1 day to implement). A **bottom sheet** (like Google Maps or Uber) is a significant UX upgrade for a map-centric app — users can peek at filters without losing map context — but adds meaningful complexity (~3–5 days).

**What makes it harder than a full-screen overlay:**

- Drag gesture handling with momentum and velocity-based snap decisions
- Multiple snap points (peek/summary → half-open → fully expanded)
- Scroll locking: the sheet content needs to scroll internally when fully expanded, but drag-to-dismiss when at scroll top
- Touch event coordination with Mapbox — preventing sheet drags from accidentally panning the map
- Tuning the snap-point thresholds so the interaction feels natural

**Library options:**

| Approach | Bundle Size | Effort | Notes |
| --- | --- | --- | --- |
| **`vaul`** or **`react-modal-sheet`** (recommended) | ~5–10KB (built on framer-motion) | 1–2 days | Purpose-built bottom sheet components. Handle snap points, drag gestures, scroll locking, and accessibility out of the box. `vaul` is by the shadcn/ui author. Best path to ship fast. |
| **framer-motion** | ~30–40KB gzipped | 3–4 days | Built-in `useDragControls` and `dragConstraints` get you 80% of the way. Declarative, React-idiomatic API. Larger bundle but your app already loads Mapbox (~200KB+), so the relative impact is small. |
| **react-spring + @use-gesture/react** | ~15KB gzipped | 4–5 days | Lighter bundle, more imperative. Spring physics can feel more polished for gesture-driven interactions, but you wire up snap-point logic and drag handling manually. Better fine-grained control, more code to write. |

**Recommendation:** Use **`vaul`** or **`react-modal-sheet`** — they're literally built for this use case and eliminate the gesture plumbing. If you need custom behavior beyond what they offer, drop down to framer-motion. Only reach for react-spring if bundle size is a hard constraint or you want maximum control over the physics feel.

### Light/Dark Mode

- shadcn/ui has **built-in dark mode support** via CSS custom properties and Tailwind's `dark:` variant — this is the primary reason dark mode is a realistic stretch goal rather than a major effort
- Use `next-themes` (recommended by shadcn/ui docs) to manage theme state, `localStorage` persistence, and `prefers-color-scheme` detection
- Mapbox supports dark basemaps out of the box — swap between `mapbox://styles/mapbox/light-v11` and `mapbox://styles/mapbox/dark-v11`
- Chart libraries (Recharts/D3) can read CSS variables for axis colors, backgrounds, and text
- The severity color palette (red → orange → yellow → green) works well on both light and dark backgrounds

```typescript
// Theme toggle example
const themes = {
  light: {
    mapStyle: 'mapbox://styles/mapbox/light-v11',
    background: '#FFFFFF',
    text: '#1A1A1A',
    cardBg: '#F5F5F5',
  },
  dark: {
    mapStyle: 'mapbox://styles/mapbox/dark-v11',
    background: '#121212',
    text: '#E0E0E0',
    cardBg: '#1E1E1E',
  }
};
```

---
