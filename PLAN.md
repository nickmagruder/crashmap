# CrashMap Plan

Phased checklist of work for CrashMap. Moved out of `CLAUDE.md` on 2026-11-16 so the agent context stays lean; `AGENTS.md` links here.

## Phase 0: Config

- [x] Domain purchased (crashmap.io)
- [x] Render Professional plan (web service)
- [x] Render Basic PostgreSQL (5GB) with data loaded
- [x] Architecture document complete

## Phase 1: Foundation: Project scaffolding and data model

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
- [x] Add `.gitattributes` enforcing `eol=lf` — fixes Prettier `format:check` failures on Windows (`core.autocrlf=true` converts LF→CRLF on checkout; `eol=lf` overrides it)

**Deliverables:** Running Next.js app, populated database, Prisma client generated

## Phase 2: API Layer: Functional GraphQL API with core queries

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

## Phase 3: Frontend Core: Basic UI Configuration, Skeleton Layout and Deployment

- [x] Set up Apollo Client with InMemoryCache and type policies
- [x] **Smoke-test deployment to Render** ✓
  - `render.yaml` created with standalone build/start commands, Node 20, env var declarations; updated to declare both `crashmap` (production, `branch: main`, `autoDeploy: false`) and `crashmap-staging` (staging, `branch: staging`, `autoDeploy: true`)
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
  - `mapStyle` — dynamic: `light-v11` or `dark-v11` based on `useTheme()` from `next-themes`
  - `style={{ width: '100%', height: '100%' }}` — fills parent; parent owns `100dvh`
- [x] Build desktop `Sidebar` component: fixed right panel (~320px) using shadcn/ui `Sheet`, toggled by a header button, hidden on mobile
- [x] Build mobile `FilterOverlay` component: full-screen overlay with open/close toggle button, visible only on mobile (<768px)
- [x] Build `SummaryBar` component: persistent bar with placeholder crash count and empty filter badge area, visible on all screen sizes
- [x] Wire `map.resize()` to sidebar and overlay open/close transitions
- [x] Smoke test responsive layout at mobile (<768px) and desktop (≥768px) breakpoints
- [x] Set default zoom for mobile to the city of Seattle
- [x] Light/Dark mode — `next-themes` provider, Sun/Moon toggle button, dynamic Mapbox style swap (`light-v11` ↔ `dark-v11`)

## Phase 4: Interactive Map with Filters

### Milestone: Prepare Data and Context for Filters

- [x] Add GeoJSON data layer — fetch crashes via GraphQL and render as a basic circle layer on the map using `Latitude`/`Longitude` fields
- [x] Add severity-based circle styling — four separate Mapbox layers (None → Minor → Major → Death) so higher-severity dots render on top; each layer has a `filter` expression and static paint properties; radius uses `interpolate` with exaggerated stops (very small at state zoom, large at street zoom)
- [x] Add crash detail popup — click a circle to show a tooltip with date, time, injury type, mode, location, involved persons, and collision report number (linked to WSP crash report portal)
- [x] Add filter state context — React Context with state + dispatch for all filters (mode, severity, date range, geo); `CrashLayer` query and `SummaryBar` count now driven by filter state

### Milestone: Implement Filtering UI

- [x] Add mode toggle filter — `ToggleGroup` in sidebar/overlay for Bicyclist / Pedestrian / All; wired to filter context
- [x] Add severity multi-select filter — `Checkbox` + `Label` for Death, Major, Minor; None/Unknown opt-in toggle; wired to filter context
- [x] Add date range quick-select — four year buttons (most recent 4 years) that set the date filter in context
- [x] Add date range custom picker — `Popover` + `Calendar` for arbitrary start/end date selection; shares the same date filter state as quick-select buttons
- [x] Load filter options on app init via `filterOptions` GraphQL query
- [x] Add geographic cascading dropdowns — State → County → City `Select` components populated from `filterOptions` query data; each level resets when parent changes; wired to filter context
- [x] Connect filters to GraphQL query variables — pass filter context state into `crashes` / `crashStats` query variables so map and summary bar update on filter change
- [x] Implement automatic zoom/view changes when a geographic filter is changed. The view will automatically change to match the range of crashes.
  - **Approach:** Two-ref pattern in `CrashLayer.tsx` — `prevGeoRef` tracks prior state/county/city values; `zoomPendingRef` flags a pending zoom. Effect 1 sets the flag when geo filter changes (skipped when `updateWithMovement` is on); Effect 2 executes `map.fitBounds()` or `map.flyTo()` when fresh data arrives. Only geo filter changes trigger zoom; severity/mode/date changes do not. See ARCHITECTURE.md §4 "Map Auto-Zoom" for full details.

**Deliverables:** Working app with map and filters

## Phase 5: Security, Polish & Deployment: Production-ready public application

- [x] Add rate limiting middleware for public API abuse prevention
- [x] Configure CSP headers and CORS in Next.js
- [x] Add loading states
- [x] Add error boundaries
- [x] Add skeleton screens
- [x] Implement URL-based state for shareable filter configurations (e.g., `?severity=Death&mode=Pedestrian&state=Ohio&county=Franklin`)
- [x] Improve dot scaling and ordering
- [x] Add data export (CSV) for filtered results
- [x] Add a data disclaimer, methodology page, and links to bicycle/pedestrian safety resources
- [x] Better Icons, improve mobile summary (sliding) (w/ emojis)
- [x] Popup viewport centering
- [x] Update Geography as map moves
- [x] Decouple state/county/city
- [x] Add satellite map & toggle
- [x] Configure custom domain `crashmap.io` in Render and set up DNS records
- [x] Deploy to Render with staging and production environments (Web Service for Next.js app, existing PostgreSQL database)
- [x] Configure Render auto-deploy from your GitHub repo's `main` branch
- [x] Set up CI/CD pipeline (GitHub Actions):
  - Lint → Type check → Test → Codegen → Build → Deploy
- [x] Configure basic monitoring (Sentry for errors, Lighthouse CI for web vitals)
- [x] Add Better Stack metrics stream via Render dashboard — infrastructure metrics (CPU, memory, response time, uptime) for both `crashmap` and `crashmap-staging`
- [x] Add a health check endpoint (e.g. `GET /api/health` returning `200 OK`) and set **Health Check Path** to `/api/health` in Render web service settings → Health & Alerts
- [x] Add a support section — Heart button to the right of the Info button; opens left panel in `'support'` view with "Support this App" heading, hosting-costs blurb, PayPal/CashApp/Venmo links, and a contact link; "← Back to Info" / "❤️ Support this App" nav links let users switch views in-place; author credit (`PanelCredit`) shown at top of both panels
- [x] Implement accessible color scale: add a new button to the left of the dark/light button. Implement a second set of colors that toggle that meet accessibility standards
- [x] Fix popup location centering
- [x] Meter the zoom: When clicking on a crash, the zoom level should be exactly half way between the "current" zoom level and the "zoomed" zoom level
- [x] Fix date picker — overhauled: controlled calendar month (no more jump-to-today), year arrows, Start/End text inputs (MM/DD/YYYY), Apply/Clear buttons, deferred commit, data-bounds toast validation
- [x] Improve Preset Date selectors
- [x] Fix desktop panel pinning
- [x] Limit query and max displayable crashes to 40,000 — Add error toast for 40,000+ crashes
- [x] Move toasts to top-center (desktop) / full-width below top buttons via `mobileOffset={{ top: 80 }}` (mobile ≤600px)
- [x] Reduce spacing between filters for laptop viewport

**Deliverables:** Deployed, public-facing production application

## Phase 6: Iteration & Bugs (Ongoing)

- [x] Gather user feedback and iterate on visualizations
- [x] Hide None/Unknown injuries by default — Mapbox layer filter excludes the None bucket on initial load
- [x] Link to Google Street View for location — "Open Street View" link at the bottom of the crash popup opens `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint={lat},{lng}` in a new tab; copy-to-clipboard button (Lucide `Copy`/`Check` icons, 2s confirmation) sits inline next to the report number
- [x] copy report # and/or autofill report #
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Develop and implement SEO strategy
- [ ] **Stretch goal: Dashboard charts** (see Section 11) — add Recharts/D3 visualizations for severity, mode, time trends, and geographic breakdowns
      Add comparative analysis features (year-over-year, area comparison)
- [ ] **Stretch goal: Tour modes:**
      Statewide, highlight dangerous streets and success stories.
      Individual city versions.
- [x] Make desktop filters "pinnable"
- [ ] Develop and implement package management & updating strategy
- [ ] Monitor query performance — add materialized views only if aggregation queries become slow
- [ ] If data grows beyond 50K rows or traffic increases, revisit the caching strategy

## Bugs

- [x] **Apollo InMemoryCache merge warning** — resolved: both `lib/apollo-client.ts` and `app/apollo-provider.tsx` now set `FilterOptions: { keyFields: false }` (console warning not re-checked in the browser). Original note: `filterOptions` field on `Query` has no keyFields or merge function, so cached `FilterOptions` objects (states/years vs. counties vs. cities) overwrite each other on every query. Fix: add a `merge: true` type policy for `FilterOptions` in the Apollo Client cache config (in `lib/apollo-client.ts` and/or `app/apollo-provider.tsx`), or give `FilterOptions` a `keyFields` entry. This avoids redundant network requests and silences the console warning.
- [x] **Sidebar SheetContent missing `Description`** — resolved: `Sidebar.tsx` no longer uses `SheetContent` (the Sheet variant was removed in favor of a simple flex-column panel).
- [ ] **Mapbox telemetry blocked by ad blockers** — `POST https://events.mapbox.com/events/v2` is blocked (`ERR_BLOCKED_BY_CLIENT`) by uBlock Origin and similar extensions. This is not a real bug — the request is Mapbox's optional usage telemetry and the map functions correctly without it. **Not worth fixing.** Document for future reference so it isn't investigated again.
- [ ] **Dark Reader hydration mismatches on color spans** — Dark Reader injects `data-darkreader-inline-bgcolor` + CSS custom properties onto elements with inline `backgroundColor` styles (severity filter dots, map key dots). Also injects `data-darkreader-inline-stroke` onto Lucide SVG icons that don't yet have `suppressHydrationWarning`. Error disappears when Dark Reader is disabled. Fix: add `suppressHydrationWarning` to color dot `<span>` elements in `InfoPanelContent.tsx` and `SeverityFilter.tsx`, and to any Lucide icon SVGs in the affected tree (`X` in `InfoSidePanel.tsx`; `ExternalLink` icons in `InfoPanelContent.tsx`).
- [ ] No severities selected

## Phase 7: Build Data Ingestion Pipeline

### Phase 7.1 — Documentation

- [x] Write `ARCHITECTURE.md` (technical reference)
- [x] Write `TUTORIAL.md` (operator step-by-step guide)
- [x] Verify WSDOT API is publicly accessible via `curl` (no auth, no CORS, no IP blocking)
  - Pedestrian endpoint: confirmed live response 2026-02-24
  - Bicyclist endpoint: confirmed live response 2026-02-24
  - `rptCategory=Pedestrians%20and%20Pedacyclists` is the same for both modes

### Phase 7.2 — Foundation & Field Mapping

> Phase 7.2–7.4 code (`backend/app.py`, the TanStack Query frontend) lives in the companion [esri-exporter](https://github.com/nickmagruder/esri-exporter) repo, not here.

- [x] Develop Plan and Architecture
- [x] Implement `generate_sql(records, mode, batch_size=500) → str` in `backend/app.py`
  - Field mapping, NULL coercion, `'` sanitization, string escaping, `CrashDate` derivation (`"geom"` is a DB-generated column — excluded from INSERT)
  - Batched `INSERT ... ON CONFLICT ("ColliRptNum") DO NOTHING` statements
  - Header comment block with mode, date, record count
- [x] Add unit tests to `backend/test_json_fixer.py`:
  - Basic mapping against `backend/seattle short.txt`
  - NULL coercion (empty string, `'` placeholder)
  - String escaping (apostrophes in string values)
  - Batch splitting
  - Duplicate `ColliRptNum` handling (DO NOTHING)

### Phase 7.3 — Backend API

- [x] Implement `POST /api/generate-sql` (file upload fallback path)
- [x] Implement `POST /api/fetch-and-generate-sql` (direct WSDOT API call)
  - Add `requests` to `backend/requirements.txt`
  - Build WSDOT URL from `mode`, `start_date`, `end_date` params
  - Call WSDOT API, pass response through `fix_malformed_json()`, then `generate_sql()`
- [x] Return `.sql` as `Content-Disposition: attachment` file response from both endpoints
- [x] Validate required fields; return 400/502 on errors

### Phase 7.4 — Frontend Refactor

- [x] Add date range pickers (start/end) and Mode selector to UI
- [x] Wire "Fetch from WSDOT" button to `POST /api/fetch-and-generate-sql`
- [x] Add "Download .sql" button via Blob URL
- [x] Keep "Debug: View Fixed JSON" as collapsible section
- [x] Implement, refactor to use TanStack Query v5 for fetching

### Phase 7.5 — Testing & Hardening

- [x] End-to-end test with real WSDOT API calls for both modes
- [x] Verify `DO NOTHING` duplicate behavior with known cross-report `ColliRptNum` values
- [x] Deploy to Render and validate `.sql` download in production
- [x] Clear current database and drop unneeded columns to prepare for mass data import (data will be fully replaced)
- [x] **Drop `CrashStatePlaneX` / `CrashStatePlaneY` from Prisma schema after DB column drop**
- [x] Complete Initial Import Checklist
- [x] Run generated `.sql` against staging Render DB → refresh CrashMap materialized views → verify records appear
- [x] Create and run a comprehensive data validation checklist

---

## Phase 8: Accessibility Audit (WCAG 2.1 AA)

### Phase 8.1 — Critical (Required for AA)

- [x] Add skip link at top of `app/layout.tsx` — visually hidden, focus-visible, jumps to `#map-region`
- [x] Add `id="map-region"` + `role="main"` to map container div in `AppShell.tsx`; add `aria-label="Crash data map"` to `<Map>` in `MapContainer.tsx`
- [x] Add explicit `<label>` elements for State, County, City `<Select>` dropdowns in `GeographicFilter.tsx`; pass matching `id` to `SelectTrigger`
- [x] Add `aria-labelledby` to both overlays pointing to their heading `id`; add Escape key handler; add focus-on-open; restore focus to trigger on close (`FilterOverlay.tsx`, `InfoOverlay.tsx`, `AppShell.tsx`)
- [x] Fix copy button in `CrashPopup.tsx` — replace `title` with `aria-label={copied ? 'Report number copied' : 'Copy report number'}`; add `aria-hidden="true"` to both icon variants

### Phase 8.2 — High (Required for AA compliance)

- [ ] Wrap crash count `<p>` in `Sidebar.tsx` and `FilterOverlay.tsx` with `role="status"` + `aria-live="polite"` + `aria-atomic="true"`
- [ ] Add "opens in new window" indication to all `target="_blank"` external links in `InfoPanelContent.tsx`, `SupportPanelContent.tsx`, and `CrashPopup.tsx` — use `aria-label` or `<span className="sr-only"> (opens in new window)</span>`; add `aria-hidden="true"` to all `<ExternalLink>` icons within those links
- [ ] Fix `Loader2` in `GeographicFilter.tsx` — change `aria-label="Loading"` → `aria-hidden="true"`; add `aria-busy="true"` to parent container when loading

### Phase 8.3 — Medium (Strongly recommended)

- [ ] Verify color contrast ratios for all severity dot colors in `lib/crashColors.ts` against light and dark backgrounds using WebAIM or DevTools; document rationale for map dot colors (non-text, 3:1 ratio applies)
- [ ] Wrap decorative emoji in `aria-hidden="true"` spans in `InfoSidePanel.tsx` and `InfoPanelContent.tsx`
- [ ] Add `<span className="sr-only">Active filters: </span>` before badge list in `SummaryBar.tsx`
- [ ] Audit all Lucide icon instances inside labeled buttons across `AppShell.tsx`, `InfoSidePanel.tsx`, `InfoPanelContent.tsx` — ensure `aria-hidden="true"` is present on each icon `<svg>`

### Phase 8.4 — Verification

- [ ] Run axe DevTools automated scan on: home page, mobile overlay open, desktop sidebar open, crash popup open — resolve all Critical and Serious violations
- [ ] Keyboard-only navigation test: tab through all interactive controls, verify skip link, focus trapping in overlays, Escape closes, focus restores on close
- [ ] Screen reader test (NVDA on Windows): map described, crash count announced on filter change, filter labels read correctly, external link new-window notices announced
- [ ] Color contrast check: Chrome DevTools Accessibility tab — inspect each severity dot on light and dark themes

---

## Phase D: Auditing docs

- [x] Audit Phase 1
- [x] Audit Phase 2
- [x] Audit Phase 3
- [x] Audit Phase 4
- [x] Audit Phase 5
- [x] Audit Phase 6
- [x] Audit Phase 7
