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
- [ ] Audit all Lucide icon instances inside labeled buttons across `AppShell.tsx`, `InfoSidePanel.tsx`, `InfoPanelContent.tsx` — ensure `aria-hidden="true"` is present on each icon `<svg>` (since `lucide-react` 1.x, Phase 9.2, icons get it automatically unless given an `aria-label`/`title`, so this audit becomes: find icons that have a label but sit inside an already-labeled control)

### Phase 8.4 — Verification

- [ ] Run axe DevTools automated scan on: home page, mobile overlay open, desktop sidebar open, crash popup open — resolve all Critical and Serious violations
- [ ] Keyboard-only navigation test: tab through all interactive controls, verify skip link, focus trapping in overlays, Escape closes, focus restores on close
- [ ] Screen reader test (NVDA on Windows): map described, crash count announced on filter change, filter labels read correctly, external link new-window notices announced
- [ ] Color contrast check: Chrome DevTools Accessibility tab — inspect each severity dot on light and dark themes

---

## Phase 9: Dependency Upgrades (planned 2026-11-16)

Snapshot on 2026-11-16: `npm outdated` showed 35 outdated packages (12 with a new major); `npm audit` reported 55 vulnerabilities (2 critical, 30 high), including a critical one in production `next` (HTTP request smuggling in rewrites, fixed in 16.4.6). Node 20, used by `render.yaml` and CI, reached end of life on 2026-04-30.

Decisions: target **Node 24** (Active LTS, EOL 2028-04-30, matches local dev); TypeScript to **6.x** only (bridge to TS 7); Sentry v11 with **reduced data collection**; **one PR per phase**, merged to `main` and smoke-tested on crashmap.io after the production deploy (no `staging` branch exists; see `AGENTS.md` → Smoke testing).

**Every PR:** `npm ci`, `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, `npm run codegen` (no diff), `npm run build`; after merge and deploy, the production smoke test: map loads, all filters and date presets, custom date range, county/city selects, crash popup + copy, CSV export, URL round-trip, light/dark and accessible palette, mobile overlays, a Sentry test error arrives, Lighthouse not regressed.

### Phase 9.1 — Node 24 + security patches (urgent; do first)

- [x] Node 24: `nodeVersion: 24` for both services in `render.yaml`; `node-version: 24` in `.github/workflows/ci.yml`; add `.nvmrc` (`24`) and `"engines": { "node": ">=24 <25" }`
- [x] Confirm Render builds with Node 24: production deploy of `2bb4cff` used Node 24.22.3 via `.nvmrc`
- [x] Diagnosed the production `MaxListenersExceededWarning: 11 close listeners added to [ServerResponse]`: reproduced locally with the standalone server, one warning per request to the Sentry `/monitoring` tunnel (30 of 30, with placeholder IDs so nothing reached Sentry) and none for pages, RSC, static assets or GraphQL. The tunnel is a Next.js external rewrite; Next 16.4.6 proxies those with `httpxy` (16.1.6 used `http-proxy`), and its `pipe` into the response wrapped by Next's `compression` middleware adds the 11th listener. The count stays at 11 on each short-lived response, so it is log noise, not a growing leak. Fix: the route-handler tunnel in 9.4
- [x] `@types/node` `^20` → `^24`
- [x] `next` and `eslint-config-next` 16.1.6 → 16.4.6 (fixes the critical `next` advisory plus `postcss`/`sharp` advisories); keep both pinned to the same exact version
- [x] `react`/`react-dom` 19.2.3 → 19.3.1 (exact pins); `@types/react`/`@types/react-dom` → 19.3.x
- [x] In-range minor/patch via `npm update --save`: Apollo Client 4.3, Apollo Server 5.5, `@apollo/client-integration-nextjs`, Prisma (`prisma`, `@prisma/client`, `@prisma/adapter-pg`) 7.10 (all three together), Sentry 10.78, `mapbox-gl` 3.35, `react-map-gl` 8.1.3, `radix-ui` 1.8, Tailwind 4.3, `date-fns`, `sonner`, `tailwind-merge`, `prettier` 3.10, `react-day-picker` 9.14, `graphql` 16.15, `eslint` 9.39.x, `dotenv` 17.x, `lint-staged` 16.x, `vitest` 4.1
- [x] `npm audit fix` (never `--force`): 23 remain (0 critical, 15 high, 8 moderate), 6 of them in production deps. All but one are cleared by the 9.2 (codegen 8, shadcn 4) and 9.4 (Sentry 11) majors. The exception, `@graphql-tools/utils` ≤12.0.1 under `@apollo/server` 5.5.2, can't be fixed yet because Apollo Server caps it at `<12.0.2`; its prototype-pollution advisories hit merge helpers that only see our own schema at startup. Recheck when Apollo Server widens the range
- [x] Prettier 3.10: only `lib/graphql/__generated__/types.ts` changed (`npm run codegen` reformats it)
- [x] GitHub Actions: `actions/checkout` v4 → v7, `actions/setup-node` v4 → v7, `actions/cache` v4 → v6 (ESM/Node 24 runtimes; no input changes affect this workflow); `treosh/lighthouse-ci-action` v12 is already the latest major
- [x] Prisma 7.10: `npx prisma generate`; all 56 tests pass; local GraphQL query returns data from the Render DB
- [x] Pulled forward from 9.4: `withSentryConfig` now imported from `@sentry/nextjs/config` (removes the v11 deprecation warning at build time)

### Phase 9.2 — Low-risk majors (dev tooling + icons)

- [x] `@graphql-codegen/cli` 8, `add` 8, `typescript` 7, `typescript-resolvers` 7: `codegen.ts` needed no changes; the regenerated types only drop five unused helper types (`Exact`, `MakeOptional`, `MakeMaybe`, `MakeEmpty`, `Incremental`). The `#graphql` tag in `typeDefs.ts` (now plucked by default) changed nothing because the config has no `documents`
- [x] `lint-staged` 17 (Node ≥ 22.22.1, Git ≥ 2.32; local Git 2.56): `npx lint-staged --diff=HEAD` runs cleanly; config in `package.json`, so the now-optional `yaml` dependency isn't needed
- [x] `dotenv` 18: removed `.env.vault` support and `node -r dotenv/config` preloading, neither used; `import 'dotenv/config'` in `prisma.config.ts` still loads `.env`
- [x] `shadcn` CLI 4 (dev only; clears the `zod` advisory): `components.json` already has the v4 alias layout; no components re-added
- [x] `lucide-react` 1.x: no brand icons used; every imported icon (including `Loader2`) still exists. v1 adds `aria-hidden="true"` to any icon without an accessible label or title (see Phase 8.3)
- [x] Audit: 23 → 11 (0 critical, 1 high), 6 in production deps (unchanged; cleared by 9.4 except the Apollo-capped `@graphql-tools/utils`). The 5 dev-only moderates left (`minimatch` DoS via `graphql-config` and the shadcn CLI's `ts-morph`) have no fix except npm's suggested downgrades, so they stay

### Phase 9.3 — Vitest 5

- [x] `vitest` 4.1 → 5.1 with `vite` 8 added as an explicit devDependency (now a peer dep). Renamed `vitest.config.ts` → `vitest.config.mts` and replaced `__dirname` with `import.meta.dirname`, which removes the "ESM loaded as CommonJS" warning; added `.vitest/` to `.gitignore`. Checked against the official migration guide: `vi.hoisted`/`vi.mock` are already top level, `vi.clearAllMocks()` in `beforeEach` matches the new `clearMocks` default, and there are no `toThrow('')`, unawaited `resolves`/`rejects`, benchmarks or removed entry points. All 56 tests pass (~1.2s warm)

### Phase 9.4 — Sentry v11

- [x] `@sentry/nextjs` 10.78 → 11.13, checked against the official v10→v11 migration notes. The ones that applied: `sendDefaultPii` → `dataCollection`, `enableLogs` removed (logs still flow through `consoleLoggingIntegration`), `withSentryConfig` from `/config`, and span streaming now the default
- [x] `next.config.ts`: import `withSentryConfig` from the new `/config` subpath (done in 9.1)
- [x] Replaced `sendDefaultPii: true` in all three `Sentry.init` calls with a shared `SENTRY_DATA_COLLECTION` (`lib/sentryConfig.ts`): `userInfo` (IP addresses), `cookies` and `httpHeaders` off, `httpBodies: []`, `databaseQueryData` off, `urlQueryParams` on (filter state only). Error capture, masked session replay, tracing and console logs are unchanged
- [x] Tunnel: Sentry 11.13 deprecates `tunnelRoute`, so it uses the new managed tunnel instead of the 11.9 route handler: `tunnel: '/monitoring'` in the browser and `serveTunnelIntegration({ path: '/monitoring' })` on the server and edge; `tunnelRoute` removed from `next.config.ts`. The server SDK now answers tunnel requests itself (no Next.js rewrite proxy). Local standalone test: 16 tunnel requests, 0 `MaxListenersExceededWarning`; empty envelopes get 400, a foreign DSN gets 403
- [x] `beforeSend` noise filters unchanged (v11 keeps `beforeSend` for error events; only `beforeSendTransaction`/`ignoreTransactions` stopped working, and neither is used)
- [x] Privacy change noted in the README changelog
- [x] Audit: 11 → 7 (0 critical); production deps 6 → 1 (only the Apollo-capped `@graphql-tools/utils`)
- [x] Deployed 2026-11-16: browser now posts to plain `/monitoring` (no `?o=&p=` query) and the map, filters and GraphQL work with a clean console. Envelopes captured through the SDK transport (span items, DSN present) all return 200
- [x] The one `/monitoring` 400 is expected: `app/sentry-example-page/page.tsx` calls `Sentry.diagnoseSdkConnectivity()` on mount, which POSTs the literal body `{}` to the tunnel only to check it's reachable, and the tunnel rejects it as an envelope with no DSN. It only happens on that page; map-to-map navigations send no 400s, and every real envelope (spans, errors, replay) returned 200
- [x] 2026-11-17: threw the sample errors on `/sentry-example-page`. Both `SentryExampleFrontendError` and `SentryExampleAPIError` reached Sentry through the tunnel (SDK 11.13.0, release `b63da92`), with 0 users. Event JSON for both: no `user.ip_address` and no IP-like strings anywhere; `request` holds only `url` (plus `method` on the server event), with no headers and no cookies. Sentry still derives a coarse `user.geo` (country/region/city) at ingest from the forwarded client IP
- [x] Render logs, 24h search for `MaxListeners` (checked 2026-11-17): warnings appear only from the pre-9.4 instances (`qckn6`, `4t28t`, `v2kwn`), the last at 2026-11-17 06:44 UTC as the 9.4 deploy replaced them. The 9.4 instance (`jps7f`) has logged none in ~11h of real traffic plus ~30 test tunnel requests
- [x] Sentry: no alert or monitor depends on transactions (only the error monitor, the issue stream and the crashmap.io uptime check), and the dashboards are Sentry's built-in templates with no custom widgets, so span streaming needs no changes
- [x] 2026-11-17: turned on Sentry "Prevent Storing of IP Addresses" for the `javascript-nextjs` project (Project Settings → Security & Privacy; API shows `scrubIPAddresses: true`). The org-level setting is still off. Stored events already had no IP; this is extra insurance and may drop the derived `user.geo` on new events

### Phase 9.5 — TypeScript 6

- [x] `typescript` 5.9.3 → 6.0.3. Checked against the official TS 6.0 notes. `tsc` passes with no errors or deprecation warnings (no `baseUrl`, `es5`, `node10` resolution, `downlevelIteration`, `outFile` or similar), and `next build` 16.4.6 type-checks with it and leaves `tsconfig.json` alone
- [x] `tsconfig.json`: added `"types": ["node"]` (TS 6 defaults `types` to `[]`; Next's declarations already pulled `@types/node` in, so this is for TS 7 readiness) and removed `dom.iterable` from `lib` (now part of `dom`). `strict`, `module: esnext` and `isolatedModules` were already set, so the new defaults change nothing. The new `noUncheckedSideEffectImports` default raised no errors
- [x] Audit note (unrelated to TS): a new advisory published 2026-11-17, picomatch ReDoS GHSA-fc5q-39xc-vjpf, covers all versions (`*`). It raises `npm audit` from 7 to 30, and production deps to 8, all via `@sentry/nextjs` build tooling (rollup commonjs plugin, nested Vite), which only matches build-config globs. No patched picomatch exists yet; recheck when one ships (`npm audit fix`)

### Phase 9.6 — react-day-picker 10

- [ ] `react-day-picker` 9 → 10: the code already uses `startMonth`/`endMonth` and no removed props; keep the `react-day-picker` package name (still supported) or switch imports in `components/ui/calendar.tsx` and `DateFilter.tsx` to `@daypicker/react`; recheck the DayPicker v9 gotchas in `AGENTS.md` (range first-click, dropdown `month` control)

### Phase 9.7 — Deferred (revisit 2027-Q1)

- [ ] ESLint 10: wait until `eslint-config-next` declares ESLint 10 in its peer dependencies (vercel/next.js#91702); no `--legacy-peer-deps`
- [ ] `graphql` 17: wait until Apollo Server 5 and graphql-codegen declare support for the final 17.x
- [ ] `pg` 9 / `pg-connection-string` 3: `sslmode=require` will switch to weaker libpq semantics (`pg` already warns at runtime). Before that upgrade, change `DATABASE_URL` locally and on Render to `sslmode=verify-full` (and update the `AGENTS.md` note)
- [ ] TypeScript 7 (native compiler): after 9.5, once Next.js and codegen work with it; try `npx tsgo --noEmit` first
- [ ] After all phases: update `AGENTS.md` (Node version, gotchas), `ARCHITECTURE.md` and the README changelog

---

## Phase D: Auditing docs

- [x] Audit Phase 1
- [x] Audit Phase 2
- [x] Audit Phase 3
- [x] Audit Phase 4
- [x] Audit Phase 5
- [x] Audit Phase 6
- [x] Audit Phase 7
