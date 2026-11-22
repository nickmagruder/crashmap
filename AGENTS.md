# CrashMap

> Public web map ([crashmap.io](https://crashmap.io)) of crash data involving injuries and fatalities to **bicyclists and pedestrians**, stored in a single PostgreSQL table and shown on an interactive, filterable Mapbox map.

## Shared standards (clankers)

Universal standards, skills and agents come from the **clankers** repo
(<https://github.com/nickmagruder/clankers>, local: `~/.claude/clankers`) and
load globally. This file holds only what is specific to this project and wins
on conflict. All projects: `~/.claude/clankers/registry/PROJECTS.md`.

## Stack

- **Frontend:** Next.js (App Router) + React + TypeScript; shadcn/ui (Radix + Tailwind); Mapbox GL JS via `react-map-gl`; React Context for UI state
- **API:** Apollo Server in a Next.js route (`/app/api/graphql`); Apollo Client with InMemoryCache; `graphql-codegen` for end-to-end types
- **Data:** PostgreSQL + PostGIS on Render (Basic plan, 5GB); Prisma 7 (`provider = "prisma-client"` + `@prisma/adapter-pg`)
- **Runtime and tooling:** Node 24 (`.nvmrc`, `engines`, `render.yaml`, CI); TypeScript 6; Vitest 5 (`vitest.config.mts`)
- **Hosting/CI:** Render (Professional web service: `crashmap` production from `main`, `crashmap-staging` from `staging`, but no `staging` branch exists on origin, so staging is idle); GitHub Actions CI deploys `main` to production via a deploy hook; domain crashmap.io
- **Observability:** Sentry (errors + session replay), Lighthouse CI (web vitals, report-only), Better Stack (infrastructure metrics via the Render metrics stream)
- **Data ingestion:** the companion [esri-exporter](https://github.com/nickmagruder/esri-exporter) repo fetches WSDOT records and generates SQL imports; the operator runbook is `data-pipeline.md`

## Working rules

- **Repository-local memory:** save project decisions, context, notes, plans, and session follow-ups in tracked repository files (typically `AGENTS.md`, `PLAN.md`, `ARCHITECTURE.md`, `PROMPTS.md`, or relevant docs). Do not use sidecar, application, or in-application memory stores. This rule wins over generic memory behavior.
- **Git (trunk-based):** every change has a GitHub issue (milestone where it fits) on the [CrashMap board](https://github.com/users/nickmagruder/projects/2); branch `<type>/<issue>-<slug>` from the latest `main`; PR body starts `Closes #N` (template in `.github/`). Branch, commit, push and open the PR as the natural next step of finished work (clankers `standards/git.md`), unless the work is exploratory or Nick said to hold off. Only Nick merges (squash), and merging deploys to production; never push to `main`, never `--no-verify`. Agent context (`AGENTS.md`, `CLAUDE.md`, `PROMPTS.md`) is committed; `.claude/` is gitignored.
- **Copilot review:** reviews every PR automatically (`.github/copilot-instructions.md`, `.github/skills/code-review/`). Before handing a PR to Nick, fix the valid comments, reply with a reason to the rest, and resolve the threads.
- **Tracking:** status lives in issues; `PLAN.md` keeps phases, design notes and results and links to the issues. Bugs and follow-ups found mid-task become issues (`follow-up` or `bug` label) added to the board with `gh project item-add 2 --owner nickmagruder --url <url>`, not only plan bullets.
- **Overrides clankers (versioning):** never bump the version on line 2 of `README.md` (`**Version:** x.x.x`); Nick edits it by hand. Agents only add changelog entries (newest at the bottom of `README.md`).
- **Prisma:** the table already exists. Use `prisma db pull` to introspect; never run `prisma migrate dev`.
- **Deployment debugging:** check the simple things first: missing env vars, wrong URLs, misconfigured Render settings.
- **Smoke testing:** PRs merge straight to `main` and deploy to production. After each deploy, CI runs automated Playwright smoke tests (`npm run smoke`, `smoke/site.smoke.ts`) on https://crashmap.io: page loads with no uncaught errors, map renders, crash count appears, API answers. For anything beyond that critical path, smoke-test by hand once the `main` CI run (check, deploy, Lighthouse, smoke) finishes. `crashmap-staging.onrender.com` doesn't serve anything. Checklist: map loads, filters and date presets, custom date range, county/city selects, crash popup + copy, URL round-trip on reload, light/dark and accessible palette, mobile overlays (<768px), CSV export, no console errors, `/api/graphql` and `/monitoring` return 200.

## Data model

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
    "Latitude" double precision,
    "Longitude" double precision,
    "Mode" text,
    "CrashDate" date,
    PRIMARY KEY ("ColliRptNum")
);
```

- `FullDate` is ISO 8601 text (`2025-02-23T00:00:00`). Use `CrashDate` (a real `date`) for all date filtering.
- `Mode` is "Bicyclist" or "Pedestrian".
- `MostSevereInjuryType` maps to four display buckets. New values may arrive with new data sources, so always map dynamically:
  - **Death:** "Dead at Scene", "Died in Hospital", "Dead on Arrival"
  - **Major Injury:** "Suspected Serious Injury"
  - **Minor Injury:** "Suspected Minor Injury", "Possible Injury"
  - **None:** "No Apparent Injury", "Unknown"
- A generated PostGIS `geom` column exists for spatial queries (excluded from INSERTs). `CrashStatePlaneX`/`Y` were dropped in Phase 7.5.
- The Prisma model uses `@map` to map camelCase properties to the PascalCase columns.
- `filter_metadata` and `available_years` materialized views feed the filter dropdowns; refresh them after every import.

## Conventions

### Prisma 7 client

- Generated into `lib/generated/prisma/` (gitignored; regenerated by `postinstall: prisma generate`).
- Import from `@/lib/generated/prisma/client` (there is no bare `index.ts`).
- The constructor needs a driver adapter: `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })`. The singleton in `lib/prisma.ts` uses the `globalThis` pattern.
- Local dev against Render needs `?sslmode=require` on `DATABASE_URL` in `.env`; restart the dev server after `.env` changes.

### Scale and intentional simplifications

A few thousand rows, possibly tens of thousands; low traffic; no real-time data. So: single table (no joins, no N+1), no auth on public queries, offset pagination, no Redis, no DataLoader, Apollo InMemoryCache as the only cache. The full filtered dataset loads client-side as GeoJSON (display cap: 40,000 crashes, with a warning toast).

### Filters (all AND-combined, live)

| Filter                                                                 | Component                          | Column                                            |
| ---------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------- |
| Date presets (90 Days, YTD, 1 Year, Last Year, 3 Years) + custom range | `Button`s + `Popover` + `Calendar` | `CrashDate`                                       |
| State / County / City                                                  | `Select`                           | `StateOrProvinceName` / `CountyName` / `CityName` |
| Mode                                                                   | `ToggleGroup`                      | `Mode`                                            |
| Injury severity (multi-select)                                         | `Checkbox` + `Label`               | `MostSevereInjuryType`                            |

- Defaults: state Washington, 1-year preset (`DEFAULT_DATE_PRESET`; the 365 days ending at the newest crash), all modes, None/Unknown injuries hidden.
- County and city are decoupled from each other; changing state clears both.
- Filter state round-trips through the URL (`lib/filterUrlState.ts`); defaults are omitted from the URL.

### Map dots

| Bucket       | Color     | Opacity | Base size (zoom 10) |
| ------------ | --------- | ------- | ------------------- |
| Death        | `#B71C1C` | 85%     | 8px                 |
| Major Injury | `#F57C00` | 70%     | 7px                 |
| Minor Injury | `#FDD835` | 55%     | 6px                 |
| None         | `#C5E1A5` | 50%     | 5px                 |

- Four Mapbox layers (`crashes-none` → `crashes-minor` → `crashes-major` → `crashes-death`) so higher severity paints on top; each has a `filter` and static paint.
- Radius scales with zoom via `interpolate`: 1–2.5px at zoom 5, 9–18px at zoom 15.
- An accessible (Paul Tol Muted) palette is toggleable; both palettes live in `lib/crashColors.ts`.
- Not yet built: mode stroke color (blue `#1565C0` bicyclist, purple `#4A148C` pedestrian) and zoom-scaled stroke width.

### Layout

- Full-viewport map (`100dvh`) on every screen size.
- Mobile (<768px): floating controls, full-screen filter and info overlays, bottom summary bar with filter badges.
- Desktop (≥768px): pinnable left info panel and right filter panel as flex siblings of the map.
- Call `map.resize()` after any panel open/close.

### Gotchas

- **Mapbox telemetry** (`events.mapbox.com`) is blocked by ad blockers: harmless, won't fix.
- **Dark Reader** injects attributes on inline-colored spans and Lucide SVGs; add `suppressHydrationWarning` where hydration warnings appear.
- **Sentry noise:** `instrumentation-client.ts` `beforeSend` drops browser-extension errors (`__firefox__`, `window.ethereum`, `runtime.sendMessage`) and Mapbox GL worker noise (`CustomEvent` type; `InvalidStateError` "The object is in an invalid state."; Mapbox's worker `Can't serialize object of unregistered class "DOMException"`). Extend that list rather than adding new filters elsewhere. Browser tracing skips spans for Mapbox requests (`isMapboxRequest` in `lib/sentryConfig.ts`), since parallel tile/style GETs otherwise trigger Sentry's "N+1 API Call" detector. A Sentry "Hydration Error" with `<font dir="auto">` in its diff is Google Translate rewriting the page, not an app bug. Only Render builds report as `production`/`staging` (`resolveSentryEnvironment`, from Render's `RENDER`/`RENDER_SERVICE_NAME` at build time); `next dev` reports as `development`, and local production builds are disabled.
- **CI YAML:** Prettier single-quotes the `'on':` key (YAML 1.1 boolean). Correct; don't revert.
- **DayPicker (`@daypicker/react` v10) range mode:** a first click sets `from === to` (treat it as start-only); with `captionLayout="dropdown"` always control `month`/`onMonthChange`; bound years with `startMonth`/`endMonth`. In the shadcn `calendar.tsx`, use v10 `classNames` keys (`month_grid`, not `table`) and keep the nav `pointer-events-none` so the dropdowns stay clickable.
- **Apollo Client v4 imports:** hooks from `@apollo/client/react`, `HttpLink` from `@apollo/client/link/http`, `gql` from `@apollo/client`.
- **react-map-gl v8:** import `Map`, `MapRef`, etc. from `react-map-gl/mapbox`.
- **Skipped queries:** `previousData` isn't cleared when `skip` turns on; override the display data explicitly (see `CrashLayer.tsx`).
- **Map-anchored banners:** render inside AppShell's `flex-1 relative` map div with `pointer-events-none` so they don't block the map.

## Key files

Per-file detail lives in `ARCHITECTURE.md` §11 "Implementation Notes".

- `README.md`: overview, version (line 2), changelog (bottom)
- `PROMPTS.md`: project prompts, including `Close-Out-Session`
- `PLAN.md`: phases, design notes and bugs list; open items link to GitHub issues
- `CONTRIBUTING.md`: coding standards and how changes are made (also read by Copilot review)
- `SECURITY.md`: vulnerability reporting and scope
- `ARCHITECTURE.md`: data model, GraphQL schema, indexes, security, detailed file notes
- `tutorial.md`: blog-post draft of the build
- `data-pipeline.md`: monthly ingestion runbook and Data Ingestion Log
- `prisma/schema.prisma`: introspected Prisma model
- `lib/prisma.ts`: PrismaClient singleton
- `lib/graphql/typeDefs.ts`: GraphQL SDL
- `lib/graphql/resolvers.ts`: resolvers, severity bucket mapping, `buildWhere`
- `lib/graphql/queries.ts`: client-side GraphQL documents
- `lib/graphql/__generated__/types.ts`: codegen output (committed; `npm run codegen`; CI drift check)
- `lib/graphql/__tests__/`: helper unit tests and resolver integration tests (Vitest); `lib/__tests__/`: other `lib/` unit tests (e.g. `sentryConfig.test.ts`, `filterUrlState.test.ts`); `context/__tests__/`: `presetToDateRange` tests
- `app/api/graphql/route.ts`: Apollo route handler, CORS, depth limit (5)
- `app/api/health/route.ts`: `GET /api/health` for Render health checks
- `lib/rate-limit.ts`: in-memory 60 req/min per-IP limiter
- `lib/apollo-client.ts`, `app/apollo-provider.tsx`: Apollo Client and cache type policies
- `context/FilterContext.tsx`: filter reducer, presets, `toCrashFilter`, badge labels
- `lib/filterUrlState.ts`: URL encode/decode of filter state
- `components/FilterUrlSync.tsx`: syncs filter state with the URL
- `components/layout/AppShell.tsx`: layout orchestrator, panels, map controls, banners
- `components/map/MapContainer.tsx`: Mapbox map, styles, popup camera behavior
- `components/map/CrashLayer.tsx`: crash query, GeoJSON layers, auto-zoom, display cap
- `components/map/CrashPopup.tsx`: crash detail popup
- `components/filters/`: date, geographic, mode and severity filters
- `components/sidebar/Sidebar.tsx`, `components/overlay/FilterOverlay.tsx`: desktop and mobile filter panels
- `components/info/`: info and support panels (desktop side panel, mobile overlay)
- `components/summary/SummaryBar.tsx`: active filter badges and export action
- `components/export/ExportButton.tsx`, `lib/csv-export.ts`: CSV export
- `lib/crashColors.ts`: standard and accessible severity palettes
- `components/ErrorBoundary.tsx`, `app/error.tsx`, `app/global-error.tsx`: error boundaries
- `instrumentation.ts`, `instrumentation-client.ts`, `sentry.*.config.ts`, `lib/sentryConfig.ts`: Sentry setup (shared tunnel path, `dataCollection` and environment in `lib/sentryConfig.ts`)
- `render.yaml`: Render services (production + staging)
- `.github/workflows/ci.yml`: lint, format, typecheck, test, codegen drift, build (the required `check` job), deploy hook, Lighthouse, post-deploy `smoke`; actions pinned by SHA
- `playwright.config.ts`, `smoke/site.smoke.ts`: post-deploy smoke tests against crashmap.io (`SMOKE_URL` overrides the target; files are `*.smoke.ts` so Vitest skips them)
- `.github/workflows/codeql.yml`, `scorecard.yml`, `.github/dependabot.yml`: code scanning, OpenSSF Scorecard, weekly grouped updates
- `.github/copilot-instructions.md`, `.github/instructions/security.instructions.md`, `.github/skills/code-review/`: Copilot PR review (the skill is synced from clankers `skills/pr-review`)
- `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md`: issue forms and PR template
- `.husky/`: pre-commit (lint-staged, then `scripts/gitleaks-staged.sh`) and commit-msg (`scripts/commit-msg.ts`, rules in `scripts/commit-msg-rules.ts`) hooks
- `.lighthouserc.json`: Lighthouse CI config

## Close-out

"Close out session" runs `Close-Out-Session` in `PROMPTS.md`, which replaces the generic clankers `close-out-session` skill for this repo. In brief:

- After a data import, update the Data Ingestion Log and the data date range in `InfoPanelContent.tsx` (steps in `data-pipeline.md`).
- Tick finished items in `PLAN.md`; never bump the version.
- Production checks (CI, crashmap.io smoke test, Render logs, Sentry) run only when the session deployed.
- Offer to ship; on Nick's yes, branch from `main`, commit and open a PR, but never merge.

## Docs kept in this repo

- `README.md`, `PLAN.md`, `ARCHITECTURE.md`, `tutorial.md` (update after significant steps), `data-pipeline.md`, `PROMPTS.md`, `CONTRIBUTING.md`, `SECURITY.md`

## Stretch goals

Dashboard charts (Recharts/D3), mobile bottom sheet (`vaul` or `react-modal-sheet`), tour modes, screen-reader map navigation. See `PLAN.md` and `ARCHITECTURE.md` §10.
