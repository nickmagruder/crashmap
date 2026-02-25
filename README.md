# CrashMap

**Version:** 0.7.0

A public-facing web application for visualizing crash data involving injuries and fatalities to bicyclists and pedestrians. Built with Next.js, Apollo GraphQL, Prisma, PostgreSQL/PostGIS, and Mapbox GL JS. The data is self-collected from state DOT websites and stored in a single PostgreSQL table. CrashMap follows a **classic three-tier architecture** (Client → Server → Data) deployed as a single Next.js application on Render.

This project was bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Changelog

### 2026-02-25 — Date Filter: Named Preset Buttons

- Replaced hardcoded year quick-select buttons (2025–2022) with four dynamic presets: **YTD**, **90 Days**, **Last Year**, and **3 Years**
- Presets are stored as a named `DatePreset` type (`'ytd' | '90d' | 'last-year' | '3y'`) in `FilterContext` rather than being resolved immediately to date ranges — active button stays highlighted on page reload
- Preset date ranges are anchored to `dataBounds.maxDate` so they never exceed available data (YTD: Jan 1 → max, 90 Days: max−90d → max, 3 Years: max−36mo → max, Last Year: always previous full calendar year)
- URL encodes preset names (`?date=90d`, `?date=last-year`, `?date=3y`); YTD is the new default and is omitted from the URL; old `?year=N` URLs still decode correctly for backward compatibility
- Popover trigger button now shows the computed date range when a preset is active (e.g. `01/01/2025 – 11/30/2025`)
- `CrashLayer` skips the GraphQL query until `dataBounds` resolves to avoid an unbounded query on initial render with a preset active
- Updated `presetToDateRange()` utility exported from `FilterContext` and shared between `toCrashFilter` (query variables) and `DateFilter` (display label)

### 2026-02-25 — Date Filter Refactor: shadcn Range Calendar

- Replaced custom date picker (text inputs, year-nav arrows, Apply button) with the default shadcn Range Calendar (`mode="range"`, `captionLayout="dropdown"`) — reduced `DateFilter.tsx` from 247 to ~155 lines
- Added month/year dropdown navigation bounded by `dataBounds` (`startMonth`/`endMonth` props)
- Fixed DayPicker v9 single-click bug: v9 sets `from === to` on first click; intercepted in `handleRangeSelect` to treat it as start-only, keeping the popover open for end-date selection
- Added controlled `month`/`setMonth` state + `onMonthChange` handler to prevent dropdown navigation from corrupting the pending range selection
- Changed Clear to keep the popover open (allows immediately starting a new selection)
- `dateFilter.type === 'none'` now skips the GraphQL query entirely (`skip: noDateFilter` in `CrashLayer`), clearing all map dots when no date is active
- Added persistent "No dates selected" warning banner (top-center of map, `TriangleAlert` icon) that appears whenever `dateFilter.type === 'none'`

### 2026-02-25 — Date Filter Overhaul + Data Bounds Validation

- Refactored `DateFilter.tsx` to follow a new project-wide React file structure convention (imports → types → helpers → component → hooks → guard clauses → render); all React files follow this order going forward
- Fixed calendar jumping to today's month after first date click by adding controlled `month`/`onMonthChange` state
- Added prev/next year arrow buttons (`«`/`»`) inside the popover, sitting above the calendar's own month arrows; both share the same controlled month state
- Added Start/End text inputs (MM/DD/YYYY format) inside the popover above the calendar; bidirectional sync: calendar clicks fill the inputs, valid typed dates update the calendar highlight and navigate to that month
- Changed commit behavior: dates are no longer applied on calendar click; they commit only on "Apply" button click or when clicking outside the popover; an "Apply" button appears when a complete pending range exists; "Clear" appears when a committed range exists; both share the same footer row
- Added `dataBounds: { minDate: string; maxDate: string } | null` to `FilterState` in `FilterContext`; populated on app load via `GET_FILTER_OPTIONS` query dispatching `SET_DATE_BOUNDS`
- Added `minDate` and `maxDate` fields to the `FilterOptions` GraphQL type and resolvers (each runs `SELECT MIN/MAX("CrashDate") FROM crashdata`); updated `GET_FILTER_OPTIONS` client query and generated types
- Installed shadcn Sonner (`npx shadcn@latest add sonner`); added `<Toaster />` to `app/layout.tsx`
- Added validation in `DateFilter` that fires a toast error (via Sonner) when: start > end, start < `dataBounds.minDate`, end > `dataBounds.maxDate`, or text input is 10 chars but not a valid MM/DD/YYYY date; validation blocks commit on Apply but allows close on outside-click (discards pending range)
- Added shadcn `Input` component (`npx shadcn@latest add input`)

### 2026-02-24 — Drop CrashStatePlaneX / CrashStatePlaneY from Prisma Schema

- Removed `crashStatePlaneX` and `crashStatePlaneY` fields from `prisma/schema.prisma` to match the DB columns already dropped from the Render PostgreSQL database; all spatial work uses `Latitude`, `Longitude`, and the PostGIS `geom` generated column exclusively
- Regenerated Prisma client (`npx prisma generate`); no migration needed since the DB columns were already dropped manually

### 2026-02-23 — Accessible Color Scale

- Added colorblind-safe color palette toggle using the Paul Tol Muted scheme: teal / tan / rose / indigo replaces the standard red / orange / yellow / green
- Eye icon button in the top-right controls bar enables/disables accessible colors; button fills when active to show state at a glance
- "Accessible colors" Switch toggle also added to Map Controls in the filter panel
- Severity legend dots in the filter panel and Map Key in the info panel update in sync with the map layers
- Extracted shared `lib/crashColors.ts` constants used by all three locations; fixes pre-existing color inconsistency between `CrashLayer.tsx` and `SeverityFilter.tsx`

### 2026-02-23 — Support Panel

- Added Heart (❤) button to the top-left map controls, to the right of the existing Info button
- Clicking it opens the left panel in a new "Support this App" view with hosting-costs blurb, PayPal/CashApp/Venmo donate links, and a contact link
- "← Back to Info" and "❤️ Support this App" nav links let users switch views in-place without reopening the panel
- Added shared `PanelCredit` component (author name + tagline) rendered at the top of both panel views
- Added GitHub repo link to The Data section of the info panel
- Fixed top map button dark-mode styling: solid `dark:bg-zinc-900 dark:border-zinc-700` instead of default semi-transparent border

### 2026-02-23 — Health Check Endpoint

- Added `GET /api/health` route returning `200 {"status":"ok"}`; `force-dynamic` prevents static caching
- Added `healthCheckPath: /api/health` to both `crashmap` and `crashmap-staging` services in `render.yaml`
- Set **Health Check Path** to `/api/health` in Render dashboard (both services) → Health & Alerts

### 2026-02-23 — Satellite Map, Apple Maps Link, Popup Refactor

- Added "Satellite view" Switch toggle to the Map Controls section in the filter panel; when on, the map uses `mapbox://styles/mapbox/satellite-streets-v12` regardless of dark/light theme
- Dot opacity reduced by 10% across all severity layers when satellite view is active (e.g. Death: 0.85 → 0.75) to maintain visual contrast against aerial imagery
- Added "Open in Apple Maps" link to the crash detail popup above the existing Google Street View link; uses `https://maps.apple.com/?ll={lat},{lng}&z=20` (opens native Maps app on iOS/macOS)
- Extracted crash popup into its own `components/map/CrashPopup.tsx` component; exports `SelectedCrash` type; owns `copied` state internally; `MapContainer` now renders `<CrashPopup crash={selectedCrash} onClose={closePopup} />`

### 2026-02-23 — CI/CD Pipeline and Staging Environment

- Added `crashmap-staging` Render web service tracking the `staging` branch; auto-deploys on every push to `staging`
- Production service (`crashmap`) set to `autoDeploy: false`; deploys are now triggered exclusively via a Render deploy hook called from GitHub Actions after CI passes on `main`
- Added codegen drift check to CI: runs `npm run codegen` and fails if `lib/graphql/__generated__/types.ts` differs from the committed file, catching schema-type divergence before it reaches production
- Added `deploy` job to CI workflow that runs after `check` passes on `main` pushes; POSTs to `RENDER_DEPLOY_HOOK_PRODUCTION` GitHub secret to trigger the Render deploy
- Full pipeline: Lint → Format → Typecheck → Test → Codegen check → Build → Deploy (main only)
- Updated `codegen` script in `package.json` to pipe prettier through the output (`graphql-codegen ... && prettier --write lib/graphql/__generated__/types.ts`); fixes a prettier/codegen conflict where codegen adds semicolons but the project's `.prettierrc` (`semi: false`) strips them, causing an unresolvable drift loop on every commit

### 2026-02-23 — Update Search as Map Moves, Decoupled Location Filters

- Added "Update search as map moves" toggle in the Map Controls section of the filter panel; when on, the crash query uses the current viewport bounding box instead of state/county/city text filters
- Map pans and zooms trigger a new query on `moveend`; previous dots stay visible during loading (Apollo `previousData`) so there is no flash-to-empty on each movement
- Viewport bbox computed by unprojecting canvas corner pixels via `map.unproject()` rather than `map.getBounds()`, which ignores camera padding from prior `fitBounds` calls; bbox includes a 5% buffer beyond the canvas edges
- Auto-zoom on geographic filter change is suppressed while "update with movement" is active (map position is user-driven)
- Removed the State selector from the Location filter (all data is from Washington)
- Decoupled County and City: either can be selected independently without resetting the other; both dropdowns load all Washington options regardless of the other's value
- `?movement=1` URL param added to `filterUrlState` encode/decode for shareable movement-mode links
- Active filter badge shows "📍 Viewport" when movement mode is on

### 2026-02-23 — Popup Viewport Centering

- Clicking a crash now animates the map to zoom in (zoom 15.5) and tilt (pitch 45°) on the crash location via `map.flyTo()`
- The viewport before clicking is saved (center, zoom, bearing, pitch) and restored with a matching `flyTo()` when the popup is dismissed (via close button or clicking empty space)
- Clicking from one crash to another while a popup is open flies to the new crash but keeps the original viewport for the eventual restore
- Implemented with `useImperativeHandle` so the existing external `mapRef` used by `AppShell` for `map.resize()` continues to work unchanged; a `savedViewportRef` (not state) stores the captured viewport without triggering re-renders

### 2026-02-20 — Summary Bar Redesign and Emoji Mode Badges

- `SummaryBar` mobile layout changed to a fixed full-width strip flush against the viewport bottom (`fixed bottom-0 left-0 right-0`), minimal height, no rounded corners; desktop changed to a `rounded-md` bar close to the bottom edge (`bottom-3`) with tighter padding
- Crash count removed from `SummaryBar`; moved to the top of `FilterContent` in `Sidebar` and to the header of `FilterOverlay`
- Export button hidden on mobile in `SummaryBar` (desktop-only via `hidden md:flex`)
- `getActiveFilterLabels` updated: mode now shows emoji(s) (🚲, 🚶🏽‍♀️, or both) instead of text; year shortened to `'25` format; state label removed (only Washington data); county omitted when a city is also selected

### 2026-02-20 — About Panel, Pinnable Panels, and Emoji Favicon

- Added `components/info/InfoPanelContent.tsx` — content for the About panel: a dedication, data description (with link to the WSDOT Crash Data Portal), a map key showing severity color legend, a data disclaimer, and a "Get Involved" list of bicycle/pedestrian safety and advocacy resources
- Added `components/info/InfoOverlay.tsx` — mobile full-screen About overlay (mirrors `FilterOverlay`, hidden on desktop via `md:hidden`)
- Added `components/info/InfoSidePanel.tsx` — desktop About panel with two rendering modes: Sheet (slides from left, with Pin button) and pinned div (flex column, with PinOff + Close buttons)
- Modified `components/sidebar/Sidebar.tsx` — added pinnable mode: Sheet renders with a Pin button; pinned renders as a flex column with PinOff + Close header; `showCloseButton={false}` so the custom header owns both actions consistently
- Refactored `components/layout/AppShell.tsx` — outer flex container so pinned panels push the map rather than overlaying it; `sidebarOpen`/`sidebarPinned`/`infoPanelOpen`/`infoPanelPinned` state; both panels default to open + pinned on desktop; `map.resize()` fires on all panel state changes; Info button added to top-left
- Changed favicon to 💥 emoji via inline SVG data URI in `app/layout.tsx` metadata

### 2026-02-20 — CSV Data Export

- Added `lib/csv-export.ts` — `generateCsv()` converts crash records to a UTF-8 CSV string with BOM (for Excel compatibility) and `downloadCsv()` triggers a browser file download; no external dependencies
- Added `GET_CRASHES_EXPORT` GraphQL query to `lib/graphql/queries.ts` — fetches all fields needed for export (colliRptNum, crashDate, time, injuryType, mode, state, county, city, jurisdiction, region, ageGroup, involvedPersons, latitude, longitude)
- Added `components/export/ExportButton.tsx` — self-contained client component using `useLazyQuery`; fires on click with the current filter state (up to 5000 records); two variants: `icon` (ghost icon button for the SummaryBar pill) and `full` (full-width outline button for Sidebar/FilterOverlay); filename includes active geo and date filters (e.g. `crashmap-washington-king-2025-2026-02-20.csv`)
- `SummaryBar` now accepts an optional `actions` slot (rendered with a separator after the filter badges); `AppShell` passes `<ExportButton variant="icon" />` there
- `Sidebar` and `FilterOverlay` each include `<ExportButton variant="full" />` at the bottom of their filter lists

### 2026-02-20 — Jurisdiction in Crash Popup

- Added `jurisdiction` field to the `GET_CRASHES` GraphQL query, `CrashLayer` GeoJSON properties, and `MapContainer` `SelectedCrash` type
- Popup now displays jurisdiction beneath the city/county line when present

### 2026-02-20 — Crash Layer Z-Ordering and Zoom Scaling

- Split `CrashLayer` from a single `crashes-circles` layer into four separate Mapbox layers (`crashes-none`, `crashes-minor`, `crashes-major`, `crashes-death`) — layers render in order, so Death dots now always appear on top of Major Injury, which appear on top of Minor Injury, etc.
- Each layer uses a Mapbox `filter` expression and static paint properties instead of nested `match` expressions
- Exaggerated zoom-based dot sizing: smaller at state-scale (zoom 5: 1–2.5px) and larger at street-scale (zoom 15: 9–18px); mid-zoom (zoom 10) reference sizes unchanged
- Updated `interactiveLayerIds` in `MapContainer` and cursor hover effects in `CrashLayer` to reference all four layer IDs

### 2026-02-20 — Google Street View Link

- Added "Open Street View" link to the crash detail popup in `MapContainer.tsx` — appears at the bottom of the popup below a divider line and opens Google Street View centered on the crash coordinates in a new tab using the `map_action=pano&viewpoint={lat},{lng}` URL scheme
- Added copy-to-clipboard button next to the collision report number — Lucide `Copy` icon switches to `Check` for 2 seconds after clicking; uses `navigator.clipboard.writeText()`

### 2026-02-20 — Shareable Filter URLs

- Added `lib/filterUrlState.ts` — pure `encodeFilterParams` / `decodeFilterParams` utilities that convert `FilterState` to/from `URLSearchParams`; default values are omitted so a clean URL (`/`) means the default view (Washington, 2025, all modes); `?state=none` encodes null/all-states; `None` in the severity CSV encodes `includeNoInjury`
- Added `components/FilterUrlSync.tsx` — invisible client component that syncs URL ↔ `FilterContext` via two effects: mount reads URL → `INIT_FROM_URL` dispatch; subsequent filter changes → `router.replace` (no history pollution); `skipFirstSyncRef` prevents the initial render from overwriting an incoming shared URL with defaults
- Added `INIT_FROM_URL` action and `UrlFilterState` exported type to `context/FilterContext.tsx` — atomic state write that bypasses cascading reset logic
- Wired `<FilterUrlSync />` in `app/layout.tsx` inside `<Suspense fallback={null}>` within `FilterProvider` (required by `useSearchParams` in the App Router)

### 2026-02-19 — Skeleton Screens

- Added `components/ui/skeleton.tsx` via `npx shadcn@latest add skeleton` — animated pulse rectangle used as a placeholder wherever data is still loading
- `GeographicFilter` now shows three skeleton rectangles (matching the height of the Select dropdowns) while the initial `filterOptions` query is in flight — replaces the previous behavior of rendering disabled, empty dropdowns
- `SummaryBar` now shows an inline skeleton pill in place of the `—` dash while `crashCount` is null (the initial query hasn't resolved yet); once data arrives it switches to the real count with the existing pulse/spinner for subsequent refetches

### 2026-02-19 — Loading States

- `GeographicFilter` now captures `loading` from the counties and cities queries; a `Loader2` spinner appears next to the "Location" label while either cascading query is in flight
- `SummaryBar` now shows a spinning `Loader2` icon alongside the existing `animate-pulse` on the crash count text while any query is in flight
- `AppShell` filter button icon swaps from `SlidersHorizontal` to a spinning `Loader2` on both mobile and desktop while the crash query is in flight — directly signals that a filter change is being processed

### 2026-02-19 — CSP Headers and CORS

- Added `Content-Security-Policy` header via `headers()` in `next.config.ts` — directives cover Next.js hydration (`unsafe-inline`; `unsafe-eval` in dev only for HMR), Mapbox tiles/telemetry (`*.mapbox.com`, `events.mapbox.com`), Mapbox blob: workers (`worker-src blob:`), and self-hosted Geist fonts (`font-src 'self'`)
- Added `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy` (camera, microphone, geolocation all denied) to all routes
- Added `OPTIONS` preflight handler and CORS headers to `app/api/graphql/route.ts` — cross-origin access restricted to `crashmap.io`, `crashmap.onrender.com`, and `localhost:3000`; `withCors()` helper clones the Apollo handler response to attach headers cleanly without losing body/status

### 2026-02-19 — Rate Limiting

- Added `lib/rate-limit.ts` — zero-dependency in-memory sliding window rate limiter; 60 requests per minute per IP; `getClientIp()` reads the `x-forwarded-for` header (set by Render's proxy) to identify real client IPs; a `setInterval` sweep runs every 5 minutes to evict IPs with no recent activity
- `GET` and `POST` handlers in `app/api/graphql/route.ts` now check the rate limit before delegating to Apollo Server; rate-limited requests receive a `429` response with a GraphQL-shaped `errors` body and a `Retry-After` header

### 2026-02-19 — Default Filter State (Washington, 2025, All Modes)

- `initialState` in `FilterContext` now defaults to `state: 'Washington'`, `dateFilter: { type: 'year', year: 2025 }`, and `mode: null` (All modes) — the map loads focused on Washington 2025 data
- `getActiveFilterLabels` now always emits a mode badge (`'All modes'` when null, `'Bicyclists'`/`'Pedestrians'` otherwise) so the SummaryBar always reflects the active mode selection; the existing `RESET` action returns to these same defaults

### 2026-02-19 — Auto-Zoom on Geographic Filter Change

- When a State, County, or City filter is selected, the map now automatically animates to fit the bounds of matching crashes (`map.fitBounds()` with 80px padding, 800ms animation, max zoom 14)
- Single-crash results use `map.flyTo()` at zoom 13 instead
- Non-geographic filter changes (severity, mode, date) do not trigger auto-zoom — the user's manually panned viewport is preserved
- Implemented via a two-ref pattern in `CrashLayer.tsx`: `prevGeoRef` tracks prior geo filter values; `zoomPendingRef` flags a pending zoom; separate effects decouple filter-change detection from data-arrival execution

### 2026-02-19 — Filter Loading State

- Added `isLoading: boolean` and `SET_LOADING` action to `FilterContext` (alongside the existing `totalCount` query-state field)
- Added `notifyOnNetworkStatusChange: true` to the `GET_CRASHES` `useQuery` call in `CrashLayer`; dispatches `SET_LOADING` on each `loading` change so the SummaryBar reflects in-flight refetches
- `SET_TOTAL_COUNT` now only dispatches when `loading` is false, keeping the previous count visible during a filter-change refetch instead of flashing `—`
- `SummaryBar` accepts an `isLoading` prop; applies `animate-pulse` to the crash-count text while a refetch is in flight

### 2026-02-19 — Dark Reader Hydration Mismatch Fix

- Added `suppressHydrationWarning` to `<Sun>` and `<Moon>` in `ThemeToggle` and to both `<SlidersHorizontal>` instances in `AppShell` — the Dark Reader browser extension injects `data-darkreader-inline-stroke` attributes into SVG elements after SSR but before React hydration, causing a harmless but noisy mismatch warning; Lucide icons forward all props to the underlying `<svg>`, so the suppression lands on the correct element

### 2026-02-19 — Geographic Cascading Dropdowns (State → County → City)

- Added `GET_FILTER_OPTIONS`, `GET_COUNTIES`, and `GET_CITIES` query documents to `lib/graphql/queries.ts`, each with exported TypeScript result types
- Created `components/filters/GeographicFilter.tsx` — three cascading shadcn `Select` dropdowns (State → County → City); states and years are loaded on component mount via `GET_FILTER_OPTIONS`; counties load lazily when a state is selected; cities load lazily when a county is selected (both using Apollo `skip` option); selecting a parent level resets children via existing `FilterContext` reducer cascade logic
- Added `<GeographicFilter />` to both `Sidebar` (desktop) and `FilterOverlay` (mobile)

### 2026-02-19 — Date Filter (Year Quick-Select + Custom Range Picker)

- Created `components/filters/DateFilter.tsx` — four year quick-select buttons (most recent 4 years, derived from `new Date().getFullYear()` at runtime); clicking the active year deselects it (`CLEAR_DATE`); clicking a new year dispatches `SET_DATE_YEAR`
- Added a "Custom range…" Popover + Calendar button below the year buttons; uses `react-day-picker` `mode="range"` to capture a start and end date with two clicks; dispatches `SET_DATE_RANGE` only when both ends are selected, then auto-closes
- `pendingRange` local state tracks in-progress calendar clicks without prematurely writing to context; reset if the popover is closed before a full range is chosen
- "Clear dates" footer appears inside the popover when a range is committed; dispatches `CLEAR_DATE`
- Year buttons and the custom range share the same `dateFilter` slot in `FilterContext` — selecting one implicitly clears the other
- Added `DateFilter` to `Sidebar` and `FilterOverlay` between Mode and Severity sections

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

### 2026-02-23 — Monitoring (Sentry + Lighthouse CI)

- Installed `@sentry/nextjs` and ran Sentry wizard; configured `instrumentation-client.ts` (client, Session Replay), `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts` (`onRequestError`), and `app/global-error.tsx`
- Added `consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] })` and `enableLogs: true` to all three Sentry init files — forwards `console.log/warn/error` calls to Sentry Logs
- DSN stored in `NEXT_PUBLIC_SENTRY_DSN` env var; declared in `render.yaml` for both services and set in Render dashboard; `SENTRY_AUTH_TOKEN` added as GitHub Actions secret and exposed in the CI build step env for source-map uploads
- Added `tunnelRoute: "/monitoring"` to `withSentryConfig` to bypass ad blockers; updated `connect-src` CSP to include `*.ingest.sentry.io` and `*.ingest.us.sentry.io` as fallback
- Updated `app/error.tsx` to call `Sentry.captureException` instead of `console.error`
- Added Lighthouse CI: `.lighthouserc.json` targeting `https://crashmap.io`; `lighthouse` job in `ci.yml` runs after `deploy` on `main`, uploads report to temporary public storage (report-only, never fails CI)
- Fixed `FilterUrlSync` sub-route redirect bug: `router.replace` now uses `usePathname()` to preserve the current path instead of always replacing to `/`

### 2026-02-19 — Error Boundaries

- Added `components/ErrorBoundary.tsx` — reusable React class component with a `fallback` prop; logs caught errors to console via `componentDidCatch`
- Added `app/error.tsx` — Next.js route-level error page with a "Try again" reset button
- Applied boundaries in `AppShell`: `MapContainer` gets a "Map failed to load / Refresh" full-screen fallback; `Sidebar` + `FilterOverlay` silently suppress (`fallback={null}`) so the map stays usable if filters crash
