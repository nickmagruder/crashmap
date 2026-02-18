# Building CrashMap: A Full-Stack Crash Data Visualization App

> A step-by-step tutorial for building a public-facing web application that visualizes bicyclist and pedestrian crash data on an interactive map.

## What We're Building

**CrashMap** is a web app that displays crash data involving injuries and fatalities to bicyclists and pedestrians on an interactive Mapbox map. Users can filter by date, location, severity, and mode (bicyclist vs. pedestrian). The stack is Next.js + React + TypeScript + Apollo GraphQL + Prisma + PostgreSQL/PostGIS + Mapbox GL JS, all hosted on Render.

---

## Phase 1: Foundation

### Step 1: Create the Next.js Project

We start by scaffolding a new Next.js project with TypeScript and Tailwind CSS:

```bash
npx create-next-app@latest crashmap --typescript --tailwind --eslint --app --src-dir=no
```

This gives us a Next.js App Router project with TypeScript and Tailwind CSS pre-configured.

### Step 2: Initialize shadcn/ui

[shadcn/ui](https://ui.shadcn.com/) provides a set of beautifully designed, accessible UI components built on Radix UI and styled with Tailwind CSS. Unlike traditional component libraries, shadcn/ui copies components directly into your project so you have full ownership and can customize them freely.

```bash
npx shadcn-ui@latest init
```

This creates a `components.json` configuration file and sets up the `lib/utils.ts` helper. We'll add specific components (Button, Select, Sheet, etc.) as we need them later.

### Step 3: Set Up the PostgreSQL Database on Render

Our crash data lives in a PostgreSQL database hosted on [Render](https://render.com/). The database was provisioned with Render's Basic plan (5GB storage) and the data was loaded into a single `crashdata` table.

The original schema looks like this:

```sql
CREATE TABLE public.crashdata
(
    "ColliRptNum" text NOT NULL,          -- Collision report number (primary key)
    "Jurisdiction" text,
    "StateOrProvinceName" text,
    "RegionName" text,
    "CountyName" text,
    "CityName" text,
    "FullDate" text,                      -- Date stored as ISO 8601 text
    "FullTime" text,
    "MostSevereInjuryType" text,          -- Death, Serious Injury, Minor Injury, None/Unknown
    "AgeGroup" text,
    "InvolvedPersons" smallint,
    "CrashStatePlaneX" real,
    "CrashStatePlaneY" real,
    "Latitude" double precision,
    "Longitude" double precision,
    "Mode" text,                          -- "Bicyclist" or "Pedestrian"
    PRIMARY KEY ("ColliRptNum")
);
```

### Step 4: Enable PostGIS

[PostGIS](https://postgis.net/) is a PostgreSQL extension that adds support for geographic/spatial data types and queries. We need it for efficient spatial queries like "find all crashes within this map bounding box."

Connect to your Render database using pgAdmin (or any SQL client) and run:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

This is a one-time setup command. You can verify it worked by running:

```sql
SELECT PostGIS_Version();
```

### Step 5: Add a Proper DATE Column

Our `FullDate` column stores dates as text in ISO 8601 format (`2025-02-23T00:00:00`). While this sorts correctly as text, having a proper `DATE` column gives us access to date functions and cleaner range queries.

First, we checked the format of the existing data:

```sql
SELECT DISTINCT "FullDate" FROM crashdata LIMIT 20;
```

The dates were in ISO 8601 format (`2025-02-23T00:00:00`), which PostgreSQL can cast directly to `DATE`. We ran these three statements in pgAdmin:

```sql
-- Add the new column
ALTER TABLE crashdata ADD COLUMN "CrashDate" date;

-- Populate it by casting the text values
UPDATE crashdata SET "CrashDate" = "FullDate"::date;

-- Add an index for fast date-range filtering
CREATE INDEX idx_crashdata_date ON crashdata ("CrashDate");
```

After running, we verified the conversion worked:

```sql
SELECT "FullDate", "CrashDate" FROM crashdata LIMIT 10;
```

Going forward, all date-range queries use `CrashDate` (e.g., `WHERE "CrashDate" BETWEEN '2024-01-01' AND '2024-12-31'`) instead of the text `FullDate` column.

### Step 6: Install Prisma

[Prisma](https://www.prisma.io/) is our ORM (Object-Relational Mapper) that provides type-safe database access from TypeScript. We install both the CLI tool (dev dependency) and the runtime client:

```bash
npm install prisma --save-dev
npm install @prisma/client
```

### Step 7: Configure Environment Variables

Before running Prisma, we need to set up our database connection string. The key consideration is **local development vs. production deployment**:

- **Local development:** Use the **External Database URL** from Render (your local machine connects over the internet)
- **Render deployment:** Use the **Internal Database URL** (lower latency, no public internet exposure)

We use a `.env` file for local development (never committed to git) and Render's environment variable settings for production.

**`.env`** (local only, gitignored):

```bash
DATABASE_URL="postgresql://USER:PASSWORD@EXTERNAL-HOST:5432/DATABASE?sslmode=require"
```

**`.env.example`** (committed, placeholder values for reference):

```bash
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
NEXT_PUBLIC_MAPBOX_TOKEN="pk.your_token_here"
```

Important notes on environment variables in Next.js:

- Only variables prefixed with `NEXT_PUBLIC_` are exposed to the browser bundle
- `DATABASE_URL` must **not** have this prefix since it contains credentials and is server-side only
- Both Next.js and Prisma automatically read from `.env` files

### Step 8: Update .gitignore

We updated `.gitignore` with entries specific to our stack:

```gitignore
# env files
.env*
!.env.example

# prisma
prisma/migrations/
```

- `.env*` with `!.env.example` ensures all env files with secrets are ignored, but the placeholder template is committed
- `prisma/migrations/` is ignored because we use `prisma db pull` (introspection) rather than `prisma migrate` since our table already exists with data

### Step 9: Initialize Prisma

With Prisma installed and the database URL configured, initialize Prisma in the project:

```bash
npx prisma init --datasource-provider postgresql
```

This creates two files:

- `prisma/schema.prisma` — the Prisma schema file where your data models live
- `prisma.config.ts` — a config file that loads the `DATABASE_URL` from `.env` via `dotenv/config`

Since `prisma.config.ts` uses `import "dotenv/config"`, install `dotenv`:

```bash
npm install dotenv --save-dev
```

### Step 10: Introspect the Existing Database

Because our `crashdata` table already exists with data on Render, we use `prisma db pull` to generate the Prisma model from the live database rather than writing it by hand or using `prisma migrate`:

```bash
npx prisma db pull
```

Prisma connects to your database using `DATABASE_URL`, reads the table structure, and writes a model into `prisma/schema.prisma`. The raw generated output looks like this:

```prisma
model crashdata {
  ColliRptNum          String    @id
  Jurisdiction         String?
  StateOrProvinceName  String?
  // ... all columns in PascalCase
  CrashDate            DateTime? @db.Date

  @@index([CrashDate], map: "idx_crashdata_date")
}
```

You'll also see a `spatial_ref_sys` model — this is a PostGIS system table that was included automatically. We keep it in the schema but won't use it directly.

### Step 11: Refine the Prisma Model

The auto-generated model uses the raw PascalCase database column names as field names. We refine it to use idiomatic camelCase TypeScript names, with `@map` decorators linking each field back to its actual column name, and `@@map` linking the model to the table name:

```prisma
model CrashData {
  colliRptNum          String    @id @map("ColliRptNum")
  jurisdiction         String?   @map("Jurisdiction")
  stateOrProvinceName  String?   @map("StateOrProvinceName")
  regionName           String?   @map("RegionName")
  countyName           String?   @map("CountyName")
  cityName             String?   @map("CityName")
  fullDate             String?   @map("FullDate")
  fullTime             String?   @map("FullTime")
  mostSevereInjuryType String?   @map("MostSevereInjuryType")
  ageGroup             String?   @map("AgeGroup")
  involvedPersons      Int?      @map("InvolvedPersons") @db.SmallInt
  crashStatePlaneX     Float?    @map("CrashStatePlaneX") @db.Real
  crashStatePlaneY     Float?    @map("CrashStatePlaneY") @db.Real
  latitude             Float?    @map("Latitude")
  longitude            Float?    @map("Longitude")
  mode                 String?   @map("Mode")
  crashDate            DateTime? @map("CrashDate") @db.Date

  @@index([crashDate], map: "idx_crashdata_date")
  @@map("crashdata")
}
```

This gives you clean TypeScript property names (e.g., `crash.stateOrProvinceName`) while Prisma handles the translation to the actual PascalCase column names in SQL.

### Step 12: Generate the Prisma Client

With the schema refined, generate the TypeScript client:

```bash
npx prisma generate
```

This creates a fully typed client in `lib/generated/prisma/` (as specified by the `output` field in the schema's `generator` block). The generated client is gitignored since it can always be regenerated from the schema.

You can now import and use the Prisma client in your API resolvers with full TypeScript autocompletion:

```typescript
import { PrismaClient } from '../lib/generated/prisma'

const prisma = new PrismaClient()

const crashes = await prisma.crashData.findMany({
  where: { mode: 'Bicyclist' },
})
```

### Step 13: Add the `geom` Column and Database Indexes

With PostGIS enabled and Prisma configured, the next step is to add a generated geometry column and create indexes for all the query patterns the app will use.

#### Why a generated column?

Our `crashdata` table already has `Latitude` and `Longitude` columns. Rather than converting our queries to use PostGIS functions every time, we add a `geom` column that PostgreSQL automatically computes and keeps in sync:

```sql
ALTER TABLE public.crashdata
  ADD COLUMN geom geometry(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("Longitude", "Latitude"), 4326)) STORED;
```

`GENERATED ALWAYS AS ... STORED` means PostgreSQL computes the value from `Longitude` and `Latitude` and physically stores it on disk. We can't insert or update it manually — the database manages it. `4326` is the SRID for WGS 84 (standard GPS coordinates).

#### Spatial index

```sql
CREATE INDEX idx_crashdata_geom ON public.crashdata USING GIST (geom);
```

`GIST` is the index type required for PostGIS geometry columns. It enables fast bounding-box and radius queries. Even with tens of thousands of rows, this makes spatial lookups sub-millisecond.

#### Filter indexes

These B-tree indexes cover every filter the UI will use:

```sql
CREATE INDEX idx_crashdata_severity ON public.crashdata ("MostSevereInjuryType");
CREATE INDEX idx_crashdata_mode ON public.crashdata ("Mode");
CREATE INDEX idx_crashdata_state ON public.crashdata ("StateOrProvinceName");
CREATE INDEX idx_crashdata_county ON public.crashdata ("CountyName");
CREATE INDEX idx_crashdata_city ON public.crashdata ("CityName");
```

Note: `idx_crashdata_date` was already created in Step 5 — don't run it again.

Verify all indexes are in place:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'crashdata'
ORDER BY indexname;
```

You should see 8 entries: the primary key plus 7 named indexes.

#### Re-introspect and regenerate

With the database updated, pull the new schema into Prisma:

```bash
npx prisma db pull
```

Prisma doesn't have a native PostGIS geometry type, so the `geom` column is represented as `Unsupported("geometry")`. That's expected — you can still read it using `prisma.$queryRaw` for raw spatial queries. Importantly, Prisma did pick up the GIST index (`type: Gist`), so the full index set is reflected in the schema.

The new field and indexes in `prisma/schema.prisma`:

```prisma
geom Unsupported("geometry")? @default(dbgenerated("st_setsrid(st_makepoint(\"Longitude\", \"Latitude\"), 4326)"))

@@index([crashDate], map: "idx_crashdata_date")
@@index([cityName], map: "idx_crashdata_city")
@@index([countyName], map: "idx_crashdata_county")
@@index([geom], map: "idx_crashdata_geom", type: Gist)
@@index([mode], map: "idx_crashdata_mode")
@@index([mostSevereInjuryType], map: "idx_crashdata_severity")
@@index([stateOrProvinceName], map: "idx_crashdata_state")
```

Regenerate the Prisma client:

```bash
npx prisma generate
```

### Step 14: Validate the Data

Before building the API or UI, it's worth running a few sanity checks on the data to catch any surprises early.

#### Row count

```sql
SELECT COUNT(*) FROM crashdata;
-- 1,315 rows
```

#### Null coordinates

Rows with null `Latitude` or `Longitude` can't be placed on the map:

```sql
SELECT COUNT(*)
FROM crashdata
WHERE "Latitude" IS NULL OR "Longitude" IS NULL;
-- 0 — every row is mappable
```

#### Mode values

```sql
SELECT "Mode", COUNT(*)
FROM crashdata
GROUP BY "Mode"
ORDER BY COUNT(*) DESC;
```

This revealed that the raw data contained `"Bicycle"` rather than the expected `"Bicyclist"`. We normalized it:

```sql
UPDATE crashdata SET "Mode" = 'Bicyclist' WHERE "Mode" = 'Bicycle';
-- UPDATE 543
```

After the update: Pedestrian (772), Bicyclist (543). No null `Mode` values.

#### MostSevereInjuryType values

```sql
SELECT "MostSevereInjuryType", COUNT(*)
FROM crashdata
GROUP BY "MostSevereInjuryType"
ORDER BY COUNT(*) DESC;
```

The raw values are more granular than initially documented:

| Raw DB Value             | Count | Display Bucket |
| ------------------------ | ----- | -------------- |
| Suspected Minor Injury   | 673   | Minor Injury   |
| Possible Injury          | 280   | Minor Injury   |
| Suspected Serious Injury | 255   | Major Injury   |
| No Apparent Injury       | 55    | None           |
| Dead at Scene            | 27    | Death          |
| Died in Hospital         | 14    | Death          |
| Unknown                  | 7     | None           |
| Dead on Arrival          | 4     | Death          |

The UI will display 4 buckets (Death, Major Injury, Minor Injury, None). The GraphQL resolver maps each bucket to its constituent raw DB values using an `IN (...)` clause. This approach is flexible — as more data sources are imported and new raw values appear, only the resolver mapping needs updating.

#### Date range and null CrashDate

```sql
SELECT COUNT(*) FROM crashdata WHERE "CrashDate" IS NULL;
-- 0

SELECT MIN("CrashDate"), MAX("CrashDate") FROM crashdata;
-- 2025-01-01 to 2025-12-31
```

All data is from 2025. The year quick-select filter UI should gracefully handle years with no data — either by showing only years that exist in the data, or by greying out empty year buttons.

#### Coordinate bounds check

```sql
SELECT COUNT(*)
FROM crashdata
WHERE "Latitude" NOT BETWEEN 24 AND 50
   OR "Longitude" NOT BETWEEN -125 AND -66;
-- 0 — all coordinates fall within the contiguous US bounding box
```

All 1,315 rows passed every check. The data is clean and ready for the API layer.

### Step 15: Create Materialized Views for Filter Dropdowns

The cascading filter dropdowns (State → County → City) and the year quick-select buttons need a list of valid values. We could query the full `crashdata` table on every page load, but a **materialized view** is a better approach: PostgreSQL computes the result once and stores it as a physical table that can be indexed and queried instantly.

#### `filter_metadata` — distinct geographic combinations

```sql
CREATE MATERIALIZED VIEW filter_metadata AS
SELECT DISTINCT
    "StateOrProvinceName" AS state,
    "CountyName" AS county,
    "CityName" AS city
FROM public.crashdata
WHERE "StateOrProvinceName" IS NOT NULL
ORDER BY state, county, city;
```

This gives us every distinct state/county/city combination in the data. The cascading dropdowns query this view rather than scanning 1,300+ crash records on every interaction.

Add an index to support the cascading query pattern (e.g., `WHERE state = 'Washington'`):

```sql
CREATE INDEX idx_filter_metadata_geo
ON filter_metadata (state, county, city);
```

#### `available_years` — distinct years for the year filter

```sql
CREATE MATERIALIZED VIEW available_years AS
SELECT DISTINCT
    EXTRACT(YEAR FROM "CrashDate")::int AS year
FROM public.crashdata
WHERE "CrashDate" IS NOT NULL
ORDER BY year DESC;
```

Result: one row, `year = 2025`. As more years of data are imported, this view will grow automatically (after a refresh).

#### Data cleanup discovered during verification

When verifying `filter_metadata`, we found 51 rows in King County, Washington with `CityName = "'"` — a single apostrophe that was clearly an import artifact (likely unincorporated county crashes where the source system wrote a SQL escape character instead of NULL). We set these to NULL:

```sql
UPDATE crashdata SET "CityName" = NULL WHERE "CityName" = '''';
-- UPDATE 51

REFRESH MATERIALIZED VIEW filter_metadata;
```

After the refresh, the `'` city was gone and only real city names remained.

#### Refreshing the views

Materialized views don't update automatically. After importing new crash data, run:

```sql
REFRESH MATERIALIZED VIEW filter_metadata;
REFRESH MATERIALIZED VIEW available_years;
```

This will be part of the data import workflow when new state data is added.

### Step 16: Set Up ESLint, Prettier, and Husky

With the database foundation complete, we set up code quality tooling before writing any application code.

#### What each tool does

- **ESLint** — already included by `create-next-app`, catches bugs and enforces code patterns
- **Prettier** — opinionated code formatter; removes all style debates by auto-formatting on save and on commit
- **`eslint-config-prettier`** — disables ESLint rules that conflict with Prettier (they'd fight otherwise)
- **Husky** — runs scripts on git hooks; we use it to run lint-staged before every commit
- **lint-staged** — runs linters only on staged files (fast — doesn't process the whole repo on every commit)

#### Install

```bash
npm install --save-dev prettier eslint-config-prettier husky lint-staged
```

#### Configure Prettier

**`.prettierrc`:**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "es5",
  "tabWidth": 2,
  "printWidth": 100
}
```

**`.prettierignore`:**

```text
node_modules/
.next/
lib/generated/
```

#### Update `eslint.config.mjs`

Add `eslint-config-prettier` as the last config entry so it overrides any conflicting ESLint formatting rules. Also add `lib/generated/**` to the ignore list so ESLint skips the Prisma-generated client:

```js
import prettier from 'eslint-config-prettier'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier, // must come last
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'lib/generated/**']),
])
```

#### Set up Husky

```bash
npx husky init
```

This creates `.husky/pre-commit` (defaulting to `npm test`) and adds `"prepare": "husky"` to `package.json`. Update `.husky/pre-commit` to run lint-staged instead:

```bash
npx lint-staged
```

#### Add lint-staged config and format scripts to `package.json`

```json
"scripts": {
  "lint": "eslint",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "prepare": "husky"
},
"lint-staged": {
  "*.{ts,tsx,js,jsx,mjs}": ["eslint --fix", "prettier --write"],
  "*.{json,css,md}": ["prettier --write"]
}
```

#### Format existing files

Run Prettier across the whole repo once to bring all existing files into compliance:

```bash
npm run format
```

Then verify both tools pass:

```bash
npm run lint        # no output = no errors
npm run format:check  # All matched files use Prettier code style!
```

From this point on, every `git commit` automatically runs ESLint and Prettier on staged files. Commits with lint errors will be blocked.

### Step 17: GitHub Actions CI Pipeline

Pre-commit hooks are a local safety net but can be bypassed with `git commit --no-verify`. A CI pipeline on GitHub is the real enforcement gate — it runs on every push and blocks merges to `main` if any check fails.

#### Add a `typecheck` script

`tsc --noEmit` does a full TypeScript type check without emitting output files. ESLint catches some type issues, but `tsc` is authoritative:

```json
"typecheck": "tsc --noEmit"
```

#### Create `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: ['**']
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Cache Next.js build
        uses: actions/cache@v4
        with:
          path: .next/cache
          key: ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-${{ hashFiles('**.[jt]s', '**.[jt]sx') }}
          restore-keys: |
            ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-

      - name: Lint
        run: npm run lint

      - name: Format check
        run: npm run format:check

      - name: Type check
        run: npm run typecheck

      - name: Build
        run: npm run build
```

A few design notes:

- **`npm ci`** uses the lockfile exactly and fails if `package-lock.json` is out of sync — stricter than `npm install`
- **Next.js build cache** — the `actions/cache` step caches `.next/cache` between runs. The primary key includes both a lockfile hash and source file hash, so it's invalidated when dependencies or code changes. The restore key falls back to a lockfile-only match so at least module compilation is reused even when source changes. Without this, Next.js emits a `⚠ No build cache found` warning and rebuilds everything from scratch each run.
- **Steps run in order** — lint and format are fast and fail early; build is slowest and runs last
- **`npm run build`** is the most important check pre-commit hooks don't cover — it catches broken imports and Next.js-specific errors
- **Triggers on all branches** so you get feedback on feature branches, not just PRs

#### Enable branch protection on GitHub

In your repo settings → Branches → Add rule for `main`:

- ✅ Require status checks to pass before merging
- ✅ Select the `check` job from the CI workflow
- ✅ Require branches to be up to date before merging

This makes the CI gate mandatory — no merges to `main` without a green build.

---

_This tutorial is a work in progress. More steps will be added as the project progresses._
