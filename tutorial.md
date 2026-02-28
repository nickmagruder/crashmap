# Building CrashMap: A Full-Stack Crash Data Visualization Map

> A step-by-step tutorial for building a public-facing web application that visualizes bicyclist and pedestrian crash data on an interactive map.

## What We're Building

**CrashMap** is a web app that displays crash data involving injuries and fatalities to bicyclists and pedestrians on an interactive Mapbox map. Users can filter by date, location, severity, and mode (bicyclist vs. pedestrian). The stack is Next.js + React + TypeScript + Apollo GraphQL + Prisma + PostgreSQL/PostGIS + Mapbox GL JS, all hosted on Render.

---

## Phase 1: Foundation: Project scaffolding and data model

### Step 1: Create the Next.js Project

We start by scaffolding a new Next.js project with TypeScript and Tailwind CSS:

```bash
npx create-next-app@latest crashmap --typescript --tailwind --eslint --app --src-dir=no
```

This gives us a Next.js App Router project with TypeScript and Tailwind CSS pre-configured.

### Step 2: Initialize shadcn/ui

[shadcn/ui](https://ui.shadcn.com/) provides a set of beautifully designed, accessible UI components built on Radix UI and styled with Tailwind CSS. Unlike traditional component libraries, shadcn/ui copies components directly into your project so you have full ownership and can customize them freely.

```bash
npx shadcn@latest init
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
    "CrashStatePlaneX" real,              -- State Plane X coordinate (dropped in Phase 7)
    "CrashStatePlaneY" real,              -- State Plane Y coordinate (dropped in Phase 7)
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
npm install @prisma/client @prisma/adapter-pg
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
/lib/generated/prisma
```

- `.env*` with `!.env.example` ensures all env files with secrets are ignored, but the placeholder template is committed
- `prisma/migrations/` is ignored because we use `prisma db pull` (introspection) rather than `prisma migrate` since our table already exists with data
- `/lib/generated/prisma` ignores the generated Prisma client output directory — it's always regenerated from the schema and should never be committed

### Step 9: Add `.gitattributes` for Consistent Line Endings

On Windows, Git's default `core.autocrlf=true` setting converts line endings from LF to CRLF on checkout. This causes Prettier's `format:check` to fail in CI (which runs on Linux and expects LF). A `.gitattributes` file overrides this at the repository level:

```text
* text=auto eol=lf
```

Create `.gitattributes` in the project root with this single line. Now Git will always check out text files with LF endings regardless of the developer's OS, and Prettier will be happy on both Windows and Linux.

### Step 10: Initialize Prisma

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

### Step 11: Introspect the Existing Database

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

### Step 12: Refine the Prisma Model

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
  crashStatePlaneX     Float?    @map("CrashStatePlaneX") @db.Real  // dropped in Phase 7
  crashStatePlaneY     Float?    @map("CrashStatePlaneY") @db.Real  // dropped in Phase 7
  latitude             Float?    @map("Latitude")
  longitude            Float?    @map("Longitude")
  mode                 String?   @map("Mode")
  crashDate            DateTime? @map("CrashDate") @db.Date

  @@index([crashDate], map: "idx_crashdata_date")
  @@map("crashdata")
}
```

This gives you clean TypeScript property names (e.g., `crash.stateOrProvinceName`) while Prisma handles the translation to the actual PascalCase column names in SQL.

> **Note:** The `CrashStatePlaneX` and `CrashStatePlaneY` columns were present in the original WSDOT export but were dropped from the database during Phase 7's data cleanup (they duplicate the Latitude/Longitude data in a different projection). They're shown here for historical accuracy — remove them when you reach Phase 7.

### Step 13: Generate the Prisma Client

With the schema refined, generate the TypeScript client:

```bash
npx prisma generate
```

This creates a fully typed client in `lib/generated/prisma/` (as specified by the `output` field in the schema's `generator` block). The generated client is gitignored since it can always be regenerated from the schema.

#### Add a `postinstall` script

To ensure the client is always regenerated after `npm install` (critical for CI and fresh clones), add this to `package.json`:

```json
"scripts": {
  "postinstall": "prisma generate"
}
```

#### Create the Prisma singleton

Prisma 7 uses a WASM-based client that **requires a driver adapter** — `new PrismaClient()` with no arguments will not type-check. Create `lib/prisma.ts` with a `globalThis` singleton pattern to prevent connection pool exhaustion during Next.js hot reloads:

```typescript
import { PrismaClient } from '@/lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Singleton pattern prevents exhausting connection pool during Next.js hot reloads in dev.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

Two things to note:

- **Import path:** `@/lib/generated/prisma/client` — the `/client` suffix is required; there is no bare `index.ts` export
- **Driver adapter:** `PrismaPg` bridges Prisma 7's WASM runtime to `pg`'s connection pool; the adapter takes a `connectionString` (not a pool object)

### Step 14: Add the `geom` Column and Database Indexes

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

### Step 15: Validate the Data

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

### Step 16: Create Materialized Views for Filter Dropdowns

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

### Step 17: Set Up ESLint, Prettier, and Husky

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

### Step 18: GitHub Actions CI Pipeline

Pre-commit hooks are a local safety net but can be bypassed with `git commit --no-verify`. A CI pipeline on GitHub is the real enforcement gate — it runs on every push and blocks merges to `main` if any check fails.

#### Add a `typecheck` script

`tsc --noEmit` does a full TypeScript type check without emitting output files. ESLint catches some type issues, but `tsc` is authoritative:

```json
"typecheck": "tsc --noEmit"
```

#### Create `.github/workflows/ci.yml`

```yaml
name: CI

'on':
  push:
    branches: ['**']

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

      - name: Test
        run: npm run test

      - name: Build
        run: npm run build
```

A few design notes:

- **`npm ci`** uses the lockfile exactly and fails if `package-lock.json` is out of sync — stricter than `npm install`
- **Next.js build cache** — the `actions/cache` step caches `.next/cache` between runs. The primary key includes both a lockfile hash and source file hash, so it's invalidated when dependencies or code changes. The restore key falls back to a lockfile-only match so at least module compilation is reused even when source changes. Without this, Next.js emits a `⚠ No build cache found` warning and rebuilds everything from scratch each run.
- **Steps run in order** — lint and format are fast and fail early; build is slowest and runs last
- **Test step runs before build** — catches logic errors without paying the full Next.js compilation cost. Because Prisma is fully mocked in the test suite, no `DATABASE_URL` secret is needed in CI
- **`npm run build`** is the most important check pre-commit hooks don't cover — it catches broken imports and Next.js-specific errors
- **Triggers on all pushes** so you get CI feedback on every branch
- **`'on':` in single quotes** — YAML 1.1 (used by GitHub Actions) treats `on` as a boolean keyword; quoting it avoids the ambiguity

> **Note:** The CI pipeline grows as the project does. In later phases we'll add a codegen drift check, a Render deploy hook, and a Lighthouse CI job. The foundation above is intentionally minimal.

#### Enable branch protection on GitHub

In your repo settings → Branches → Add rule for `main`:

- ✅ Require status checks to pass before merging
- ✅ Select the `check` job from the CI workflow
- ✅ Require branches to be up to date before merging

This makes the CI gate mandatory — no merges to `main` without a green build.

---

## Phase 2: API Layer: Functional GraphQL API with core queries

### Step 1: Install Apollo Server

Phase 2 focuses on the GraphQL API. We're using [Apollo Server](https://www.apollographql.com/docs/apollo-server/) integrated into a Next.js App Router route handler.

**Why Apollo Server?**

Apollo Server is the most widely-used GraphQL server for JavaScript, with first-class TypeScript support, a built-in sandbox (Apollo Studio Explorer), and a mature ecosystem. For App Router specifically, Apollo Server does not ship a built-in Next.js integration — instead, there's a community-maintained package in the official `apollo-server-integrations` GitHub organization: `@as-integrations/next`.

> **Note:** The Apollo blog post "Next.js — Getting Started" covers the **Pages Router** only. For App Router, `@as-integrations/next` is the correct integration. The `startServerAndCreateNextHandler` function wraps Apollo Server into a standard Next.js route handler that works with both GET and POST.

**Packages:**

- `@apollo/server` — the Apollo Server core
- `graphql` — the GraphQL.js peer dependency (required by Apollo Server)
- `@as-integrations/next` — bridges Apollo Server with Next.js App Router route handlers

```bash
npm install @apollo/server graphql @as-integrations/next
```

### Step 2: Create the GraphQL Route Handler

Apollo Server needs a single route handler at `app/api/graphql/route.ts`. This file creates an `ApolloServer` instance, wraps it with `startServerAndCreateNextHandler`, and exports the result as both `GET` and `POST` handlers so the GraphQL endpoint supports both HTTP methods.

```typescript
// app/api/graphql/route.ts
import { ApolloServer } from '@apollo/server'
import { startServerAndCreateNextHandler } from '@as-integrations/next'
import { NextRequest } from 'next/server'

const typeDefs = `#graphql
  type Query {
    hello: String
  }
`

const resolvers = {
  Query: {
    hello: () => 'Hello from CrashMap GraphQL!',
  },
}

const server = new ApolloServer({ typeDefs, resolvers })

const handler = startServerAndCreateNextHandler<NextRequest>(server)

export async function GET(request: NextRequest) {
  return handler(request)
}

export async function POST(request: NextRequest) {
  return handler(request)
}
```

The `#graphql` comment in the template literal is a convention that enables GraphQL syntax highlighting in editors that support it (VS Code with the GraphQL extension, for example).

The `<NextRequest>` generic ensures the request type is properly inferred if you later add a `context` function to expose the request object to resolvers.

> **Next.js 16 gotcha:** You might expect to write `export { handler as GET, handler as POST }` — but this fails to compile with Next.js 16, which requires route exports to be explicit `async function` signatures typed as `(request: NextRequest) => Promise<Response>`. The `@as-integrations/next` handler is overloaded to support both Pages Router and App Router, so re-exporting it directly fails the type check. Wrapping it in explicit async functions resolves the conflict.

**Verify the endpoint:**

Start the dev server and navigate to `http://localhost:3000/api/graphql` in your browser. Apollo Server automatically serves the Apollo Sandbox Explorer on GET requests, where you can run test queries.

Run the hello query to confirm everything is wired up:

```graphql
query {
  hello
}
```

Expected result:

```json
{
  "data": {
    "hello": "Hello from CrashMap GraphQL!"
  }
}
```

### Step 3: Prisma Singleton and the Prisma 7 Driver Adapter

Before writing resolvers, we need a `PrismaClient` instance. In Next.js, the dev server uses hot module replacement — if you create a new `PrismaClient` on every hot reload you'll exhaust the database connection pool. The solution is a module-level singleton stored on `globalThis`.

**Prisma 7 gotcha — driver adapter required:**

The new `provider = "prisma-client"` generator in Prisma 7 no longer reads `DATABASE_URL` from the environment automatically. Instead, it requires an explicit driver adapter passed to the constructor. For a PostgreSQL connection, that's `@prisma/adapter-pg` — already installed in Phase 1 Step 6.

**`lib/prisma.ts`:**

```typescript
import { PrismaClient } from '@/lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

A few things to note:

- **Import path:** Unlike traditional Prisma (which exports from `@prisma/client`), the new generator outputs to a custom path. With `output = "../lib/generated/prisma"` in the schema, there's no `index.ts` — the entry point is `@/lib/generated/prisma/client`.
- **`globalThis` pattern:** In production (persistent Node.js process on Render), the module is cached normally so a single instance is created. In development, `globalForPrisma.prisma` persists across hot reloads so the same instance is reused.
- **`DATABASE_URL!`:** The `!` non-null assertion is appropriate here — if `DATABASE_URL` is missing, we want a hard crash at startup rather than a confusing error later.

**Also add `postinstall: prisma generate` to `package.json`:**

```json
"postinstall": "prisma generate"
```

This ensures the generated client is created after `npm ci` in CI, since `lib/generated/prisma/` is gitignored.

### Step 4: Define the Full GraphQL Schema

With a working hello-world endpoint confirmed, replace the inline schema with the real one. Move the type definitions to a dedicated file — `lib/graphql/typeDefs.ts` — and update the route handler to import from it.

**Why a separate file?**

Keeping the schema in `route.ts` works for hello-world, but it quickly becomes unmanageable. A dedicated `typeDefs.ts` file keeps the schema readable on its own, allows `graphql-codegen` to import it directly (Step 6), and lets `resolvers.ts` import shared types.

**`lib/graphql/typeDefs.ts`:**

```typescript
export const typeDefs = `#graphql
  # ── Core crash record ───────────────────────────────────────────────────────

  type Crash {
    colliRptNum: ID!
    jurisdiction: String
    state: String
    region: String
    county: String
    city: String
    date: String        # Original FullDate text (ISO 8601)
    crashDate: String   # Proper DATE column (YYYY-MM-DD)
    time: String
    severity: String    # Mapped display bucket: Death | Major Injury | Minor Injury | None
    injuryType: String  # Raw MostSevereInjuryType value from the database
    ageGroup: String
    involvedPersons: Int
    latitude: Float
    longitude: Float
    mode: String        # "Bicyclist" or "Pedestrian"
  }

  # ── Filters ──────────────────────────────────────────────────────────────────

  input BBoxInput {
    minLat: Float!
    minLng: Float!
    maxLat: Float!
    maxLng: Float!
  }

  input CrashFilter {
    severity: [String]          # Multi-select: ["Death", "Major Injury", ...]
    mode: String                # "Bicyclist" | "Pedestrian"
    state: String
    county: String
    city: String
    dateFrom: String            # "YYYY-MM-DD" — used with dateTo for custom ranges
    dateTo: String              # "YYYY-MM-DD"
    year: Int                   # Shortcut: sets dateFrom/dateTo to full calendar year
    bbox: BBoxInput             # Viewport-based spatial filter
    includeNoInjury: Boolean    # Default false — opt-in to show None/Unknown severity
  }

  # ── Query return types ────────────────────────────────────────────────────────

  type CrashResult {
    items: [Crash!]!
    totalCount: Int!
  }

  type ModeStat {
    mode: String!
    count: Int!
  }

  type SeverityStat {
    severity: String!
    count: Int!
  }

  type CountyStat {
    county: String!
    count: Int!
  }

  type CrashStats {
    totalCrashes: Int!
    totalFatal: Int!
    byMode: [ModeStat!]!
    bySeverity: [SeverityStat!]!
    byCounty: [CountyStat!]!
  }

  # FilterOptions fields carry their own arguments to support cascading dropdowns:
  # counties(state) returns only counties within the given state, etc.
  type FilterOptions {
    states: [String!]!
    counties(state: String): [String!]!
    cities(state: String, county: String): [String!]!
    years: [Int!]!
    severities: [String!]!
    modes: [String!]!
  }

  # ── Queries ───────────────────────────────────────────────────────────────────

  type Query {
    crashes(filter: CrashFilter, limit: Int = 1000, offset: Int = 0): CrashResult!
    crash(colliRptNum: ID!): Crash
    crashStats(filter: CrashFilter): CrashStats!
    filterOptions: FilterOptions!
  }
`
```

A few design notes:

- **`injuryType`** exposes the raw `MostSevereInjuryType` DB value alongside the bucketed `severity`. This lets the popup show the exact original value while the map layers and filters use the bucketed version.
- **`FilterOptions` field arguments** (`counties(state: String)`) are field-level arguments, not query-level. Apollo resolves them when the field itself is requested, passing the argument to the field resolver.
- **`includeNoInjury`** on `CrashFilter` is a separate boolean rather than a severity bucket value — it opts into showing `None`/`Unknown` injuries, which are hidden by default.

**Update `app/api/graphql/route.ts` to import from separate files:**

Replace the inline hello-world `typeDefs` and `resolvers` with imports:

```typescript
import { ApolloServer } from '@apollo/server'
import { startServerAndCreateNextHandler } from '@as-integrations/next'
import { NextRequest } from 'next/server'
import { typeDefs } from '@/lib/graphql/typeDefs'
import { resolvers } from '@/lib/graphql/resolvers'

const server = new ApolloServer({ typeDefs, resolvers })

const handler = startServerAndCreateNextHandler<NextRequest>(server)

export async function GET(request: NextRequest) {
  return handler(request)
}

export async function POST(request: NextRequest) {
  return handler(request)
}
```

The `resolvers` import is a forward reference at this point — create the file as an empty stub (`export const resolvers = {}`) so TypeScript doesn't complain while you build out the schema. You'll replace it in the next step.

---

### Step 5: Implement GraphQL Resolvers

With the schema defined and Prisma set up, we can implement the resolvers in `lib/graphql/resolvers.ts`. All resolvers delegate to Prisma — no raw SQL except for the materialized view queries in `FilterOptions`.

#### Severity bucket mapping

The database stores raw severity values like `"Dead at Scene"` and `"Died in Hospital"`, but the UI works with four display buckets: `Death`, `Major Injury`, `Minor Injury`, and `None`. We define this mapping once and use it in both directions:

```typescript
const SEVERITY_BUCKETS: Record<string, string[]> = {
  Death: ['Dead at Scene', 'Died in Hospital', 'Dead on Arrival'],
  'Major Injury': ['Suspected Serious Injury'],
  'Minor Injury': ['Suspected Minor Injury', 'Possible Injury'],
  None: ['No Apparent Injury', 'Unknown'],
}
```

`rawToBucket` converts a single raw DB value to its display bucket (with a passthrough for any unmapped values — this handles future data imports gracefully). `bucketsToRawValues` does the reverse, expanding a list of bucket names to all their constituent raw values for `WHERE IN (...)` queries.

#### `buildWhere` — translating GraphQL filter input to a Prisma where clause

All four queries share the same filter logic. Rather than repeating it, we extract a `buildWhere` function:

- `mode`, `state`, `county`, `city` → simple equality filters on the mapped Prisma field names
- `year` → shortcut that sets `crashDate >= Jan 1` and `crashDate <= Dec 31` of that year
- `dateFrom` / `dateTo` → direct date range on `crashDate`
- `bbox` → latitude/longitude range filters (hits the indexed columns)
- `severity` (array of bucket names) → expands to raw DB values and filters with `IN`
- `includeNoInjury: false` (default) → excludes the `None` bucket raw values with `NOT IN`

#### Query resolvers

`crashes` runs `findMany` and `count` in parallel using `Promise.all`:

```typescript
const [items, totalCount] = await Promise.all([
  prisma.crashData.findMany({ where, skip: offset, take: limit }),
  prisma.crashData.count({ where }),
])
return { items, totalCount }
```

`crashStats` runs five queries in parallel: total count, fatal count, and three `groupBy` queries for mode, severity, and county breakdowns. Because multiple raw DB values map to the same severity bucket, the severity counts are aggregated client-side using a `Map` before returning:

```typescript
const bucketTotals = new Map<string, number>()
for (const g of severityGroups) {
  const bucket = rawToBucket(g.mostSevereInjuryType) ?? 'Unknown'
  bucketTotals.set(bucket, (bucketTotals.get(bucket) ?? 0) + g._count._all)
}
```

#### `Crash` field resolvers

The GraphQL `Crash` type uses shorter field names (`state`, `county`, `severity`) while the Prisma model uses the full column names (`stateOrProvinceName`, `countyName`, `mostSevereInjuryType`). Apollo resolves fields automatically when names match — only the mismatched ones need explicit resolvers:

```typescript
Crash: {
  state: (parent) => parent.stateOrProvinceName,
  region: (parent) => parent.regionName,
  county: (parent) => parent.countyName,
  city: (parent) => parent.cityName,
  date: (parent) => parent.fullDate,
  time: (parent) => parent.fullTime,
  severity: (parent) => rawToBucket(parent.mostSevereInjuryType),
  injuryType: (parent) => parent.mostSevereInjuryType,
  crashDate: (parent) => parent.crashDate?.toISOString().slice(0, 10) ?? null,
}
```

Only fields where the GraphQL name differs from the Prisma field name require explicit resolvers. Fields that match by name exactly — `colliRptNum`, `jurisdiction`, `ageGroup`, `involvedPersons`, `latitude`, `longitude`, `mode` — resolve automatically without any resolver entry.

The `injuryType` resolver exposes the raw DB value (`"Dead at Scene"`, `"Suspected Serious Injury"`, etc.) alongside the bucketed `severity`. The popup uses `injuryType` to show the precise original value while the map layers and filters use `severity`.

The `crashDate` resolver formats Prisma's `Date` object as a `YYYY-MM-DD` string. `.toISOString()` returns UTC midnight, so `.slice(0, 10)` reliably extracts the date portion.

#### `FilterOptions` field resolvers

`filterOptions` at the Query level returns an empty object `{}`. Apollo then calls each field resolver on that object, passing any field-level arguments (e.g. `counties(state: "Washington")`):

```typescript
FilterOptions: {
  states: async () => {
    const rows = await prisma.$queryRaw<{ state: string }[]>`
      SELECT DISTINCT state FROM filter_metadata WHERE state IS NOT NULL ORDER BY state
    `
    return rows.map((r) => r.state)
  },
  counties: async (_, { state }) => {
    const rows = state
      ? await prisma.$queryRaw<{ county: string }[]>`
          SELECT DISTINCT county FROM filter_metadata
          WHERE state = ${state} AND county IS NOT NULL ORDER BY county
        `
      : await prisma.$queryRaw<{ county: string }[]>`
          SELECT DISTINCT county FROM filter_metadata WHERE county IS NOT NULL ORDER BY county
        `
    return rows.map((r) => r.county)
  },

  // cities has three branches: both state+county, state only, or no filters.
  // This is more complex than counties because the cascading dropdown supports
  // filtering by county independently of state (they are decoupled in the UI).
  cities: async (_, { state, county }) => {
    const rows =
      state && county
        ? await prisma.$queryRaw<{ city: string }[]>`
            SELECT DISTINCT city FROM filter_metadata
            WHERE state = ${state} AND county = ${county} AND city IS NOT NULL ORDER BY city
          `
        : state
          ? await prisma.$queryRaw<{ city: string }[]>`
              SELECT DISTINCT city FROM filter_metadata
              WHERE state = ${state} AND city IS NOT NULL ORDER BY city
            `
          : await prisma.$queryRaw<{ city: string }[]>`
              SELECT DISTINCT city FROM filter_metadata WHERE city IS NOT NULL ORDER BY city
            `
    return rows.map((r) => r.city)
  },

  years: async () => {
    const rows = await prisma.$queryRaw<{ year: number }[]>`
      SELECT year FROM available_years ORDER BY year DESC
    `
    return rows.map((r) => Number(r.year))
  },

  severities: () => ['Death', 'Major Injury', 'Minor Injury', 'None'],
  modes: () => ['Bicyclist', 'Pedestrian'],
}
```

Prisma's tagged template `$queryRaw` automatically parameterizes interpolated values, so `WHERE state = ${state}` is safe from SQL injection. The `severities` and `modes` resolvers return static arrays — no DB call needed.

---

### Step 6: GraphQL Codegen — End-to-End TypeScript Types

With the schema and resolvers in place, the next step is **automatic TypeScript type generation**. `graphql-codegen` reads your GraphQL schema and produces a `types.ts` file with resolver signatures, input types, and return types — keeping TypeScript in sync with your schema automatically.

### Install packages

```bash
npm install --save-dev @graphql-codegen/cli @graphql-codegen/typescript @graphql-codegen/typescript-resolvers @graphql-codegen/add
```

- `@graphql-codegen/cli` — the codegen runner
- `@graphql-codegen/typescript` — generates base TypeScript types (scalars, inputs, object types)
- `@graphql-codegen/typescript-resolvers` — generates a `Resolvers` type covering every resolver function signature
- `@graphql-codegen/add` — injects arbitrary content (used to prepend `/* eslint-disable */` to the generated file)

### Add the `codegen` script

In `package.json`:

```json
"codegen": "graphql-codegen --config codegen.ts && prettier --write lib/graphql/__generated__/types.ts"
```

The `prettier --write` post-process is important: without it, the generated file won't match the project's Prettier format, and lint-staged will flag it on every commit. Piping Prettier through the codegen script ensures the output is always commit-ready.

Run it manually after any schema change: `npm run codegen`.

### Create `codegen.ts`

```ts
import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  // CodeFileLoader picks up the named `typeDefs` export from the TypeScript file.
  schema: './lib/graphql/typeDefs.ts',
  generates: {
    'lib/graphql/__generated__/types.ts': {
      plugins: [{ add: { content: '/* eslint-disable */' } }, 'typescript', 'typescript-resolvers'],
      config: {
        mappers: {
          // Crash field resolvers receive the Prisma CrashData model as parent.
          Crash: '../../generated/prisma/client#CrashData',
          // FilterOptions field resolvers receive {} — the empty object returned
          // by the filterOptions Query resolver; each field resolver supplies its own data.
          FilterOptions: '{}',
        },
        scalars: { ID: 'string' },
      },
    },
  },
  ignoreNoDocuments: true,
}

export default config
```

**Key config decisions:**

- `schema: './lib/graphql/typeDefs.ts'` — codegen uses `@graphql-tools/code-file-loader`, which dynamically imports the TS file and picks up the named `typeDefs` export. No separate `.graphql` file needed.
- `mappers.Crash` — tells codegen that the "parent" object flowing into `Crash` field resolvers is `CrashData` (the Prisma model), not the GraphQL `Crash` type. This means `state: (parent) => parent.stateOrProvinceName` is fully typed — TypeScript knows `parent` is `CrashData` and that `stateOrProvinceName` exists on it.
- `mappers.FilterOptions` — the `filterOptions` Query resolver returns `{}` (empty object); each field resolver queries the DB independently. The `{}` mapper reflects this parent type.
- `ignoreNoDocuments: true` — suppresses the warning about missing client-side query documents (those come in Phase 3 when the frontend is built).

### Run it

```bash
npm run codegen
```

This generates `lib/graphql/__generated__/types.ts` containing:

- `CrashFilter`, `BBoxInput` — typed input objects
- `Crash`, `CrashResult`, `CrashStats`, `FilterOptions`, etc. — typed output objects
- `QueryCrashesArgs`, `QueryCrashStatsArgs`, etc. — typed argument objects per query
- `Resolvers` — the big one: a type that covers every resolver function, with correct parent types (via mappers), argument types, and return types

### Wire it into `resolvers.ts`

```ts
import type { CrashFilter, Resolvers } from './__generated__/types'

export const resolvers: Resolvers = {
  Query: {
    crashes: async (_, { filter, limit, offset }) => { ... },
    // No explicit type annotation needed — Resolvers provides them
  },
  Crash: {
    // parent is CrashData (Prisma) — TypeScript knows stateOrProvinceName exists
    state: (parent) => parent.stateOrProvinceName,
    ...
  },
}
```

Replacing the manual `CrashFilterInput` and `CrashParent` interfaces with the generated `Resolvers` type means:

- Any schema change that breaks a resolver is caught immediately by TypeScript
- You never need to maintain parallel type definitions
- IDE autocomplete works on all resolver arguments and return values

### Important: codegen depends on Prisma generate

The `Crash` mapper imports `CrashData` from `lib/generated/prisma/client`. Since `lib/generated/prisma/` is gitignored (regenerated by `postinstall`), codegen needs Prisma to have been generated first. The `postinstall` hook handles this automatically on every `npm install`, so the order is always correct.

---

### Step 7: Query Depth Limiting

GraphQL's composable selection sets are powerful for clients, but they also mean a malicious (or accidentally complex) query could ask for deeply nested fields and trigger expensive resolver chains. Depth limiting rejects such queries at the validation layer — before any resolver runs.

### Why inline instead of a library

The standard library is `graphql-depth-limit`, but it was last published in 2018 and has no active maintenance. For a flat schema like ours, the logic is just ~15 lines:

```typescript
// app/api/graphql/route.ts
import { GraphQLError, ValidationContext } from 'graphql'
import type { ASTNode, ValidationRule } from 'graphql'

const MAX_DEPTH = 5

function queryDepth(node: ASTNode, depth = 0): number {
  if ('selectionSet' in node && node.selectionSet) {
    const sels = (node.selectionSet as { selections: readonly ASTNode[] }).selections
    if (sels.length === 0) return depth
    return Math.max(...sels.map((s) => queryDepth(s, depth + 1)))
  }
  return depth
}

const depthLimitRule: ValidationRule = (context: ValidationContext) => ({
  Document(doc) {
    for (const def of doc.definitions) {
      const depth = queryDepth(def as ASTNode)
      if (depth > MAX_DEPTH) {
        context.reportError(new GraphQLError(`Query depth limit exceeded (max: ${MAX_DEPTH}).`))
      }
    }
  },
})
```

`queryDepth` recursively walks the AST, counting field nesting depth. `Math.max` over all branches finds the deepest path. The guard for `sels.length === 0` prevents `Math.max()` returning `-Infinity` on empty selection sets.

`ValidationRule` is `(context: ValidationContext) => ASTVisitor` — Apollo Server calls our rule during the validation phase on every incoming document, before execution begins.

### Choosing the depth limit

Our schema's maximum legitimate depth:

| Query                             | Path                     | Depth |
| --------------------------------- | ------------------------ | ----- |
| `crashes { items { severity } }`  | query → `items` → field  | 3     |
| `crashStats { byMode { count } }` | query → `byMode` → field | 3     |
| `filterOptions { counties }`      | query → field            | 2     |

A limit of 5 allows all real queries with two levels of headroom for introspection and future schema additions.

### Wiring it up

Pass `validationRules` to the `ApolloServer` constructor:

```typescript
const server = new ApolloServer({
  typeDefs,
  resolvers,
  validationRules: [depthLimitRule],
})
```

Apollo Server runs all validation rules (including its own built-in rules) before executing any query. If `depthLimitRule` reports an error, Apollo returns a 400 with the error message and never calls a resolver.

---

### Step 8: Offset-Based Pagination and Server-Side Limit Cap

The `crashes` query already supports offset-based pagination — it was baked into the schema from the start:

```graphql
type Query {
  crashes(filter: CrashFilter, limit: Int = 1000, offset: Int = 0): CrashResult!
}

type CrashResult {
  items: [Crash!]!
  totalCount: Int!
}
```

The resolver runs `findMany` and `count` in parallel so callers get both the current page of items and the total count needed to compute page numbers:

```typescript
const [items, totalCount] = await Promise.all([
  prisma.crashData.findMany({ where, skip: offset ?? 0, take: cappedLimit }),
  prisma.crashData.count({ where }),
])
return { items, totalCount }
```

### Server-side limit cap

One gap: the `limit` argument has a default but no enforced maximum. A caller could send `limit: 999999` and pull the entire table in a single request. For a small dataset this isn't catastrophic, but it's a good habit to enforce a ceiling on the server.

We add a simple cap in the resolver before passing `limit` to Prisma:

```typescript
const cappedLimit = Math.min(limit ?? 1000, 40000)
```

`Math.min(limit ?? 1000, 40000)` handles three cases:

- Caller omits `limit` → defaults to 1000 (the schema default)
- Caller passes a reasonable value → used as-is (up to 40,000)
- Caller passes an excessive value → silently capped at 40,000

No error is thrown — the cap is transparent. This is appropriate for a public read-only API where the caller just wants data; a hard error on an oversized `limit` would be unnecessarily strict.

For the CrashMap use case, the map loads the full filtered dataset client-side so Mapbox can render and filter it. With a few thousand rows at launch and a ceiling of 40,000, a single request at full scale fits comfortably within the cap.

> **Note:** The initial implementation set this cap at 5,000. It was raised to 40,000 in Phase 5 to match the display limit imposed by a Sonner warning toast shown to users when results exceed that threshold.

---

### Step 9: Resolver Integration Tests with Vitest

With a working GraphQL API, we need tests to verify our resolver logic stays correct as the codebase evolves. We'll use [Vitest](https://vitest.dev/) — a modern test runner with native TypeScript support, built-in mocking, and zero-config setup.

### Why Vitest?

Vitest is the natural choice for a modern TypeScript project:

- **Native TypeScript** — no `ts-jest` or separate compilation step
- **Built-in mocking** — `vi.fn()`, `vi.mock()`, `vi.hoisted()` replace `jest.fn()` and `jest.mock()`
- **Fast** — uses Vite's transform pipeline, so tests start in under a second
- **Compatible** — same `describe`/`it`/`expect` API as Jest, so the learning curve is minimal

### Install Vitest

```bash
npm install --save-dev vitest
```

### Configure Vitest

Create `vitest.config.ts` in the project root:

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

Key detail: the `@` alias must be configured here to match `tsconfig.json`'s `"@/*": ["./*"]`. Vitest does not read tsconfig paths by default — without this alias, any `@/lib/...` import in your source files would fail during tests.

`globals: true` makes `describe`, `it`, and `expect` available without explicit imports (though you can still import them for clarity).

### Add test scripts

In `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

`vitest run` executes all tests once and exits (for CI). `vitest` starts in watch mode (for development).

### Testing strategy: mock Prisma, not the database

Our resolvers import `prisma` from `@/lib/prisma` at the module level. Rather than spinning up a test database (which would require replicating our Render PostgreSQL with PostGIS, materialized views, and seed data), we **mock the Prisma module** using `vi.mock()`. This lets us test:

- Severity bucket mapping (`rawToBucket`, `bucketsToRawValues`)
- Filter-to-where-clause building (`buildWhere`)
- Pagination capping (limit at 40,000)
- Crash field resolver transformations (severity mapping, date formatting, field name mapping)
- Full GraphQL query execution via Apollo Server's `executeOperation()`

All without a database connection.

### Export helper functions

The helper functions `rawToBucket`, `bucketsToRawValues`, `buildWhere`, and `SEVERITY_BUCKETS` were previously module-private in `resolvers.ts`. To test them directly, add the `export` keyword:

```typescript
export const SEVERITY_BUCKETS: Record<string, string[]> = { ... }
export function rawToBucket(raw: string | null | undefined): string | null { ... }
export function bucketsToRawValues(buckets: ReadonlyArray<string | null | undefined>): string[] { ... }
export function buildWhere(filter?: CrashFilter | null) { ... }
```

This is a non-breaking change — existing imports of `resolvers` continue to work.

### Test file 1: `lib/graphql/__tests__/helpers.test.ts`

This file tests the three pure helper functions with no mocking needed.

**`rawToBucket`** — 12 tests covering:

- All 8 raw DB values map to the correct display bucket (Death, Major Injury, Minor Injury, None)
- `null`, `undefined`, and empty string return `null`
- Unmapped values pass through as-is (handles future data imports gracefully)

**`bucketsToRawValues`** — 8 tests covering:

- Each bucket expands to its constituent raw values
- Multiple buckets combine correctly
- Empty arrays return empty arrays
- `null`/`undefined` elements are filtered out
- Unknown bucket names pass through as-is

**`buildWhere`** — 17 tests covering:

- Default behavior: excludes "None" severity when no filter is provided
- `includeNoInjury: true` removes the default exclusion
- Severity filter expands bucket names to raw values with `{ in: [...] }`
- Each simple field filter (mode, state, county, city) maps to the correct Prisma field
- Year shortcut converts to a `crashDate` range (Jan 1 to Dec 31)
- `dateFrom`/`dateTo` produce `gte`/`lte` on `crashDate`
- Year takes precedence over `dateFrom`/`dateTo`
- Bounding box produces `latitude`/`longitude` range filters
- Combined filters merge correctly

### Test file 2: `lib/graphql/__tests__/queries.test.ts`

This file uses Apollo Server's `executeOperation()` to send real GraphQL queries through the full resolver chain, with Prisma mocked at the module level.

#### Mocking Prisma with `vi.hoisted()`

The key challenge: `vi.mock()` factories are hoisted to the top of the file by Vitest, which means any variable declared with `const` is in the temporal dead zone when the factory runs. The solution is `vi.hoisted()`:

```typescript
const mockPrisma = vi.hoisted(() => ({
  crashData: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  $queryRaw: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
```

`vi.hoisted()` creates the mock object in the hoisted scope so it's available when `vi.mock()` executes. Each test then configures return values with `mockPrisma.crashData.findMany.mockResolvedValue(...)`.

#### `executeOperation` — testing without HTTP

Apollo Server's `executeOperation()` sends a query through the full server pipeline (parsing → validation → execution) without starting an HTTP server. This tests the complete resolver chain including field resolvers, argument handling, and error propagation:

```typescript
const result = await server.executeOperation({
  query: CRASHES_QUERY,
  variables: { filter: { severity: ['Death'] } },
})

assert(result.body.kind === 'single')
expect(result.body.singleResult.data?.crashes.totalCount).toBe(1)
```

#### Test coverage (19 tests)

**`crashes` query** — 6 tests: items + totalCount returned, field resolvers map correctly, limit capped at 40,000, default limit 1000, offset passed, severity filter forwarded to Prisma

**`crash` query** — 2 tests: found (returns crash), not found (returns null)

**`crashStats` query** — 2 tests: aggregation returns correct shape, multiple raw severity values merge into same display bucket (e.g., "Dead at Scene" + "Dead on Arrival" → "Death")

**`filterOptions` query** — 6 tests: states/counties/cities/years from `$queryRaw` mock, hardcoded severities, hardcoded modes

**Crash field resolvers** — 3 tests: null severity → null, null crashDate → null, unmapped severity values pass through

### Running the tests

```bash
npm test          # 56 tests, all passing
npm run test:watch  # watch mode for development
```

The full suite runs in under 2 seconds — fast enough for watch mode during development and CI.

With the test suite in place, adding a `Test` step to the CI workflow is straightforward — `npm run test` runs `vitest run`, which exits with a non-zero code on any failure. Because Prisma is fully mocked, CI requires no database connection.

---

### Step 10: Update the CI Pipeline

Phase 2 introduced two new checks that belong in CI: the test suite (Step 9) and codegen drift detection (Step 6). Update `.github/workflows/ci.yml` to add both after the existing type check step.

**Add the `Test` step:**

```yaml
- name: Test
  run: npm run test
```

**Add the `Codegen drift check` step:**

```yaml
- name: Codegen drift check
  run: |
    npm run codegen
    git diff --exit-code lib/graphql/__generated__/types.ts
```

This step re-runs codegen in CI and verifies the output matches what was committed. If a developer changes the schema in `typeDefs.ts` without running `npm run codegen` first, this step catches the mismatch and fails the build. Because `npm run codegen` also runs Prettier on the output, the drift check confirms both content and formatting are in sync.

**Final step order after Phase 2:**

```text
Lint → Format check → Type check → Test → Codegen drift check → Build
```

The updated `ci.yml` jobs section (showing only the `check` job steps):

```yaml
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
      key: "${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-${{ hashFiles('**.[jt]s', '**.[jt]sx') }}"
      restore-keys: |
        ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-

  - name: Lint
    run: npm run lint

  - name: Format check
    run: npm run format:check

  - name: Type check
    run: npm run typecheck

  - name: Test
    run: npm run test

  - name: Codegen drift check
    run: |
      npm run codegen
      git diff --exit-code lib/graphql/__generated__/types.ts

  - name: Build
    run: npm run build
```

> **Note:** The Build step will gain a `SENTRY_AUTH_TOKEN` env variable when Sentry is added in Phase 5 — leave it out for now. The `deploy` and `lighthouse` jobs added in later phases also don't belong here yet.

**Deliverables for Phase 2:** Fully tested GraphQL API — all queries verified via `executeOperation()`, type-safe via codegen, depth-limited, rate-limited, and continuously validated by CI on every push.

---

---

## Phase 3: Frontend Core: Basic UI Configuration, Skeleton Layout and Deployment

### Step 1: Set Up Apollo Client

With a working GraphQL API, we now need a way to query it from the browser. The map and filter panel are both highly interactive client-side components — when a user changes a filter, the app needs to re-query the server and update the map in real time. That's inherently client-side reactive behavior that can't be handled by React Server Components alone.

**Why Apollo Client?**

Apollo Client is the natural companion to Apollo Server: consistent tooling, shared `graphql` peer dependency, and InMemoryCache for automatic deduplication (switching a filter back and forth reuses cached results). The alternative would be TanStack Query + `fetch`, which is lighter but adds its own abstraction layer.

#### The current package name

The integration package has been renamed. Install:

```bash
npm install @apollo/client@latest @apollo/client-integration-nextjs
```

> **Note:** The old package `@apollo/experimental-nextjs-app-support` has been superseded by `@apollo/client-integration-nextjs`. If you see tutorials or blog posts referencing the old name, they are outdated. The new package re-exports `ApolloClient`, `InMemoryCache`, and `ApolloNextAppProvider` directly — you do not need to import these from `@apollo/client` separately.

#### Two clients: RSC and client-side

The Next.js App Router has two rendering environments:

- **React Server Components (RSC)** — run on the server, can use `async/await` directly, no browser APIs
- **Client Components** (`"use client"`) — run in the browser, can use React hooks and browser APIs

Apollo provides a different entry point for each. We set both up now even though the map and filters will be client-side — the RSC client (`getClient()`) is useful for server-rendered data like page metadata or initial state.

#### `lib/apollo-client.ts` — RSC client

```ts
import { HttpLink } from '@apollo/client'
import {
  ApolloClient,
  InMemoryCache,
  registerApolloClient,
} from '@apollo/client-integration-nextjs'

function makeCache() {
  return new InMemoryCache({
    typePolicies: {
      Crash: { keyFields: ['colliRptNum'] },
      CrashResult: { keyFields: false },
      CrashStats: { keyFields: false },
      FilterOptions: { keyFields: false },
      ModeStat: { keyFields: false },
      SeverityStat: { keyFields: false },
      CountyStat: { keyFields: false },
    },
  })
}

export const { getClient, query, PreloadQuery } = registerApolloClient(() => {
  return new ApolloClient({
    cache: makeCache(),
    link: new HttpLink({
      uri: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/graphql`,
    }),
  })
})
```

The RSC client needs an absolute URL — server-side `fetch` has no concept of a relative origin. `NEXT_PUBLIC_APP_URL` will be set to the production URL during the smoke-test deployment step; for local dev it falls back to `http://localhost:3000`.

#### `app/apollo-provider.tsx` — client boundary

```tsx
'use client'

import { HttpLink } from '@apollo/client'
import {
  ApolloClient,
  ApolloNextAppProvider,
  InMemoryCache,
} from '@apollo/client-integration-nextjs'

function makeClient() {
  const httpLink = new HttpLink({ uri: '/api/graphql' })
  return new ApolloClient({
    cache: new InMemoryCache({
      typePolicies: {
        Crash: { keyFields: ['colliRptNum'] },
        CrashResult: { keyFields: false },
        CrashStats: { keyFields: false },
        FilterOptions: { keyFields: false },
        ModeStat: { keyFields: false },
        SeverityStat: { keyFields: false },
        CountyStat: { keyFields: false },
      },
    }),
    link: httpLink,
  })
}

export function ApolloProvider({ children }: React.PropsWithChildren) {
  return <ApolloNextAppProvider makeClient={makeClient}>{children}</ApolloNextAppProvider>
}
```

The client-side provider uses a relative `/api/graphql` URL — the browser knows the origin automatically. `makeClient` is a function (not a constant) so `ApolloNextAppProvider` can create the client lazily and handle SSR correctly.

#### InMemoryCache type policies

By default, Apollo normalizes cached objects using an `id` or `_id` field. Our `Crash` type uses `colliRptNum` as its primary key, so we tell Apollo explicitly:

```ts
Crash: {
  keyFields: ['colliRptNum']
}
```

The aggregate and wrapper types (`CrashResult`, `CrashStats`, `FilterOptions`, etc.) have no natural ID — they're query-level response shapes, not individual entities. Setting `keyFields: false` tells Apollo to skip normalization for these types and store them inline in the parent query's cache entry. Without this, Apollo logs warnings about missing cache keys on every query.

#### Wire the provider into `app/layout.tsx`

```tsx
import { ApolloProvider } from './apollo-provider'

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ApolloProvider>{children}</ApolloProvider>
      </body>
    </html>
  )
}
```

Any Client Component in the tree can now call `useQuery`, `useLazyQuery`, or `useSuspenseQuery` from `@apollo/client` without any additional setup.

**Verify:**

```bash
npm run typecheck   # no output = clean
npm run build       # should complete successfully
```

---

### Step 2: Smoke-Test Deployment to Render

Before building the interactive frontend, it's worth deploying the app now and confirming the production environment works end-to-end. Catching a deployment problem early (Prisma adapter misconfiguration, missing env var, wrong Node version) is much easier than untangling it after weeks of frontend work.

#### Why `output: 'standalone'`?

Next.js's standalone output mode bundles only the files needed to run the server — no `node_modules` tree, no dev dependencies. The result is a much smaller artifact that starts faster on Render. The tradeoff is that the start command changes from `next start` to `node .next/standalone/server.js`, and you need to manually copy static assets into the standalone directory after the build.

Set it in `next.config.ts`:

```ts
const nextConfig: NextConfig = {
  output: 'standalone',
}
```

#### Create `render.yaml`

Render supports an infrastructure-as-code file at the project root. This documents your deployment config in version control rather than only in the Render dashboard:

```yaml
services:
  - type: web
    name: crashmap
    runtime: node
    branch: main
    autoDeploy: false
    buildCommand: >-
      npm ci && npm run build &&
      cp -r public .next/standalone/public &&
      cp -r .next/static .next/standalone/.next/static
    startCommand: node .next/standalone/server.js
    nodeVersion: 20
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: NEXT_PUBLIC_MAPBOX_TOKEN
        sync: false
      - key: NEXT_PUBLIC_APP_URL
        sync: false
```

`sync: false` on env vars means they are declared here for documentation purposes but must be set manually in the Render dashboard — they are never committed to the repo.

- **`branch: main`** — Render deploys from the `main` branch only; other branches do not trigger production deploys.
- **`autoDeploy: false`** — disables Render's built-in auto-deploy on push. We trigger deploys from GitHub Actions after CI passes instead (configured in Step 10 of Phase 2). This prevents a broken commit from reaching production even if it passes Render's checks.

> **Phase 5 additions:** In Phase 5, a `crashmap-staging` service (tracking the `staging` branch with `autoDeploy: true`) and a `healthCheckPath: /api/health` field are added to both services. These are left out here to keep the initial deployment simple.

The build command has three parts:

1. `npm ci` — clean install from `package-lock.json` (also runs `postinstall: prisma generate`)
2. `npm run build` — Next.js production build, outputs to `.next/standalone/`
3. Two `cp` commands — copy public assets into the standalone bundle (Next.js does not do this automatically)

#### Create `.env.example`

Always commit a `.env.example` alongside a gitignored `.env`. It documents exactly what env vars the project needs, making onboarding and Render dashboard setup unambiguous:

```bash
# PostgreSQL connection string — set in Render dashboard, never commit the real value
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"

# Mapbox public access token — get from mapbox.com/account/access-tokens
NEXT_PUBLIC_MAPBOX_TOKEN="pk.eyJ1IjoiLi4uIn0..."

# Absolute base URL of the deployed app — used by Apollo Client for SSR
# Local dev: http://localhost:3000
# Production: https://crashmap.io (or your .onrender.com URL until the domain is wired up)
NEXT_PUBLIC_APP_URL="https://crashmap.io"
```

> **Why `?sslmode=require`?** Render's PostgreSQL requires SSL connections. Without it, Prisma will refuse to connect in production. For local dev, include it in `.env` as well — Render's external connection string already includes SSL.
>
> **Why `NEXT_PUBLIC_APP_URL`?** The RSC Apollo Client needs an absolute URL to call `/api/graphql` — server-side `fetch` has no concept of a relative origin. See Step 1.

#### Verify the build locally

Before pushing, confirm the production build passes on your machine:

```bash
npm run build
```

Expected output: `✓ Compiled successfully`, all pages generated, `.next/standalone/server.js` created.

> **Windows note:** You may see a `⚠ Failed to copy traced files … EINVAL` warning about files with `[externals]_node:buffer_...` in their names. This is a Windows filesystem quirk — square brackets are disallowed in `copyfile` paths on Windows. Render runs Linux where this is not an issue. The build is valid and the warning can be ignored.

#### Set up the Render web service

1. Render Dashboard → **New → Web Service**
2. Connect your GitHub repo, branch: `main`
3. Render will detect `render.yaml`. Confirm the build and start commands match.
4. Set env vars in **Environment** tab: `DATABASE_URL`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `NEXT_PUBLIC_APP_URL` (your `.onrender.com` URL to start)
5. Under **Deploy**, set auto-deploy to **After CI Checks Pass** — Render will wait for your GitHub Actions workflow to go green before deploying. A broken commit can never reach production.

> **Gotcha — push config before first deploy:** If you trigger a Render deploy before committing `next.config.ts` with `output: 'standalone'`, the build will succeed but the `cp` commands will fail with `cannot create directory '.next/standalone/public': No such file or directory` — because standalone output only exists when Next.js is configured to produce it. Always commit and push all config changes before the first deploy attempt.

#### Verify the GraphQL endpoint

Once Render deploys, hit the endpoint with a browser GET request:

```text
https://YOUR-APP.onrender.com/api/graphql
```

You should see the Apollo Sandbox Explorer. Run a quick query to confirm the database connection is live:

```graphql
query {
  filterOptions {
    states
  }
}
```

A response with actual state names confirms the full stack is working in production.

---

### Step 3: Install shadcn/ui Components

With the deployment confirmed and Apollo Client wired up, we can now install the UI component library that powers the filters, sidebar, and other interactive elements.

[shadcn/ui](https://ui.shadcn.com/) was initialized back in Step 2 (during project scaffolding), which created `components.json` and set up the `lib/utils.ts` helper. At that time, we ran `npx shadcn-ui@latest init` — but the package has since been renamed. The current CLI is simply `shadcn`.

> **Package rename note:** The shadcn CLI was renamed from `shadcn-ui` to `shadcn` at some point after v2. If you scaffolded your project with the old name, that's fine — the `components.json` is compatible. Going forward, all component additions use `npx shadcn@latest add ...` (or just `npx shadcn add ...` if it's already in your devDependencies).

#### What we're installing

These components cover every UI element needed for the filter panel, sidebar, and summary bar in the CrashMap MVP:

| Component      | Used for                                              |
| -------------- | ----------------------------------------------------- |
| `button`       | Year quick-select, filter apply/reset, sidebar toggle |
| `select`       | State, County, City cascading dropdowns               |
| `checkbox`     | Severity multi-select (Death, Major, Minor, None)     |
| `toggle-group` | Mode filter (Bicyclist / Pedestrian / All)            |
| `sheet`        | Desktop sidebar panel (~320px, slides in from right)  |
| `dialog`       | Confirmation modals (future use)                      |
| `badge`        | Active filter labels in the summary bar               |
| `popover`      | Date range picker container                           |
| `calendar`     | Date range picker calendar UI                         |

#### Install all components at once

```bash
npx shadcn@latest add button select checkbox toggle-group sheet dialog badge popover calendar
```

shadcn also installs `toggle` as a peer dependency of `toggle-group`, so you'll see 10 files created even though 9 components were listed.

The `calendar` component has two additional runtime dependencies that shadcn installs automatically:

- **`date-fns`** — date utility library used by the calendar for date arithmetic
- **`react-day-picker`** — the underlying headless calendar component

Both are added to `dependencies` in `package.json`.

#### What gets created

All components are copied into `components/ui/` as plain TypeScript/React files that you own:

```text
components/ui/
  badge.tsx
  button.tsx
  calendar.tsx
  checkbox.tsx
  dialog.tsx
  popover.tsx
  select.tsx
  sheet.tsx
  toggle-group.tsx
  toggle.tsx
```

Unlike traditional component libraries, these files are part of your codebase — you can modify styles, behavior, and props directly. shadcn is a code generator, not a runtime dependency.

#### Verify

Run the type checker to confirm all new component imports are valid:

```bash
npm run typecheck   # no output = clean
```

The components are ready to use anywhere in the app via `@/components/ui/button`, `@/components/ui/sheet`, etc.

---

### Step 4: Install Map Dependencies

With Apollo Client wired up and the app deployed to Render, the next major Phase 3 milestone is building the interactive map UI. The first step is installing the mapping libraries.

**Why react-map-gl?**

[react-map-gl](https://visgl.github.io/react-map-gl/) is the standard React wrapper for Mapbox GL JS (and MapLibre GL). Rather than managing a raw `mapboxgl.Map` instance in a `useEffect`, react-map-gl exposes the map as a declarative React tree — GeoJSON sources, layers, popups, and markers are all React components. This integrates naturally with our state-driven filter system.

**Packages:**

```bash
npm install react-map-gl mapbox-gl @types/mapbox-gl
```

- `react-map-gl@8` — React component wrapper; v8 restructured imports by library: use `react-map-gl/mapbox` for mapbox-gl >= 3.5
- `mapbox-gl@3` — the GL rendering engine (current: v3.18.1); CSS must be imported separately
- `@types/mapbox-gl` — TypeScript type definitions (react-map-gl v7+ requires this as an explicit dependency)

#### Next.js App Router compatibility

Mapbox GL JS uses Web Workers and browser-only APIs — it has no SSR support. In Next.js App Router, the correct approach is:

1. **Mark map components `'use client'`** — this is the standard pattern for browser-only libraries in App Router
2. **Add `transpilePackages`** — Next.js needs to transpile these ESM packages for the bundler

In `next.config.ts`:

```ts
const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['react-map-gl', 'mapbox-gl'],
}
```

> **Note:** Some older guides recommend `dynamic(() => import('./MapComponent'), { ssr: false })`. With App Router and `'use client'`, this is no longer necessary — the `'use client'` boundary already ensures the component only runs in the browser.

#### Mapbox CSS

Mapbox GL JS requires its stylesheet for the map to render correctly, and for popups, markers, and controls to display properly. Import it globally in `app/layout.tsx`:

```ts
import 'mapbox-gl/dist/mapbox-gl.css'
```

This goes in `layout.tsx` (not in the map component) so the CSS loads once for the whole app, regardless of which page the map appears on.

#### Import path for react-map-gl v8

react-map-gl v8 changed its import structure. For mapbox-gl >= 3.5, **always import from `react-map-gl/mapbox`**, not from `react-map-gl`:

```ts
// Correct for mapbox-gl >= 3.5:
import Map, { Source, Layer, Popup, Marker } from 'react-map-gl/mapbox'

// Old (v7 and earlier):
import Map from 'react-map-gl' // ← don't use this with mapbox-gl v3
```

**Verify:**

```bash
npx tsc --noEmit   # no output = clean
```

### Step 5: Secure the Mapbox Access Token

The `NEXT_PUBLIC_MAPBOX_TOKEN` env var is referenced in `MapContainer` but it needs to be provisioned in two places: locally for development and on Render for production.

#### What kind of token?

Mapbox issues two types of tokens:

- **Public tokens** (`pk.xxx`) — intended for client-side use. They're embedded in your JS bundle, which means they're visible to anyone who inspects your page. This is expected and by design — Mapbox's security model relies on **URL restrictions**, not token secrecy.
- **Secret tokens** (`sk.xxx`) — for server-side use only (e.g., uploading tilesets). Never use these in client code.

Use your **Default public token** (`pk.xxx`) from [account.mapbox.com/access-tokens](https://account.mapbox.com/access-tokens), or create a dedicated one for CrashMap.

#### Restrict the token by URL (recommended)

Public tokens can be scoped to specific URLs so they can't be used from other domains even if scraped:

1. Open the token in the Mapbox dashboard
2. Under **Allowed URLs**, add:
   - `http://localhost:3000`
   - `https://crashmap.onrender.com`
   - `https://crashmap.io` (when live)

This won't affect functionality — requests from these origins will work normally. Requests from any other origin will be rejected by Mapbox's API.

#### Local development — `.env.local`

The existing `.env` file is used by Prisma's CLI (loaded via `dotenv/config` in `prisma.config.ts`) and should stay focused on database configuration. `NEXT_PUBLIC_*` variables for Next.js go in `.env.local`, which is also gitignored by `.env*` in `.gitignore`.

Create `.env.local` at the project root:

```bash
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1IjoiWU9VUl9VU0VSTkFNRSI...
```

Next.js automatically loads `.env.local` in all environments. The `NEXT_PUBLIC_` prefix makes the value available in client-side code (it gets inlined at build time into the JS bundle).

#### Production — Render dashboard

`render.yaml` already declares `NEXT_PUBLIC_MAPBOX_TOKEN` with `sync: false`, which means Render knows the variable exists but requires you to set the value manually in the dashboard (it's never committed to the repo):

1. Open [dashboard.render.com](https://dashboard.render.com) → **crashmap** web service
2. Click **Environment** → find `NEXT_PUBLIC_MAPBOX_TOKEN`
3. Paste the `pk.` token value → **Save Changes**
4. Render triggers a new deploy automatically

**Verify locally:**

```bash
npm run dev
```

The `NEXT_PUBLIC_MAPBOX_TOKEN` value is now available to `MapContainer` at `process.env.NEXT_PUBLIC_MAPBOX_TOKEN`. The map won't render yet (we haven't built `MapContainer`), but the token is wired up and ready.

---

### Step 6: Build the Map Page

With the Mapbox token wired up, we can now build the two pieces that put the map on screen: the `MapContainer` component and the root page layout.

#### Create `components/map/MapContainer.tsx`

The map component must be a Client Component — Mapbox GL JS uses Web Workers and browser APIs with no SSR support. Create the file:

```tsx
'use client'

import Map from 'react-map-gl/mapbox'

export function MapContainer() {
  return (
    <Map
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={{ longitude: -120.5, latitude: 47.5, zoom: 7 }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/light-v11"
    />
  )
}
```

A few details:

- `react-map-gl/mapbox` — the correct import path for mapbox-gl >= 3.5 (v8 restructured imports by renderer)
- `initialViewState` — centers on Washington state, where our initial dataset lives
- `style={{ width: '100%', height: '100%' }}` — the map fills its parent; the parent is responsible for declaring the height
- `mapStyle="mapbox://styles/mapbox/light-v11"` — a clean, neutral basemap well-suited for data visualization overlays

#### Replace `app/page.tsx`

The root page stays a Server Component — all client code is isolated in `MapContainer`. Strip the Next.js boilerplate entirely and render the map in a full-viewport wrapper:

```tsx
import { MapContainer } from '@/components/map/MapContainer'

export default function Home() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh' }}>
      <MapContainer />
    </div>
  )
}
```

The `position: relative` on the wrapper is intentional — it will be the anchor point for future absolutely-positioned overlays (the filter panel, summary bar, sidebar toggle button). `100dvh` uses the dynamic viewport height unit, which accounts for mobile browser chrome correctly.

#### Disable the Next.js dev indicator

Next.js renders a small floating badge in the bottom-left corner during development. On a full-viewport map, this badge overlaps the map controls. Disable it in `next.config.ts`:

```ts
const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['react-map-gl', 'mapbox-gl'],
  devIndicators: false,
}
```

This is a dev-only setting with no effect in production.

#### Verification

```bash
npm run dev
```

Open `http://localhost:3000`. You should see a full-viewport Mapbox map centered on Washington state with no boilerplate and no dev badge. The map is interactive — pan, zoom, and rotate work out of the box.

---

### Step 7: Build the Desktop Sidebar

With the map on screen, the next piece of UI is the filter sidebar. On desktop (≥768px), filters live in a right-side panel that slides in over the map. On mobile, filters will be a separate full-screen overlay (a later step). For now, we scaffold the desktop sidebar so the layout is in place before any filter controls exist.

#### Architecture: why `AppShell`?

`app/page.tsx` is currently a Server Component that renders `MapContainer` directly. But the sidebar needs client-side state — specifically, whether it's open or closed. This state must live in a `'use client'` component.

The cleanest approach is an `AppShell` client component that:

1. Owns the sidebar open/closed state
2. Renders the map, the toggle button, and the sidebar panel

`page.tsx` stays a Server Component — all client code is isolated in `AppShell`. This follows the same pattern as `MapContainer`: client boundaries are pushed as deep as possible.

#### Create `components/sidebar/Sidebar.tsx`

The sidebar is built on shadcn/ui's `Sheet` component — a slide-in panel backed by Radix UI's Dialog primitive. We use the controlled form (passing `open` and `onOpenChange`) rather than the trigger-based form, so the toggle button can live elsewhere:

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-80 sm:max-w-80">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          <p className="text-sm text-muted-foreground">Filter controls coming soon.</p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

Key details:

- **`side="right"`** — slides in from the right edge
- **`w-80 sm:max-w-80`** — `w-80` = 320px. The default Sheet has `sm:max-w-sm` (384px) at the `sm` breakpoint; we override both to pin the width to exactly 320px
- **`onOpenChange`** — Sheet's close button and clicking the dark overlay both trigger this callback; `!open && onClose()` converts that to a simple `onClose` call
- No `'use client'` needed here — `Sheet` is already a client component (it imports from Radix), so Next.js automatically marks this as client-side

#### Create `components/layout/AppShell.tsx`

```tsx
'use client'

import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { MapContainer } from '@/components/map/MapContainer'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { Button } from '@/components/ui/button'

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <>
      <MapContainer />

      {/* Sidebar toggle button — desktop only */}
      <div className="absolute top-4 right-4 z-10 hidden md:block">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open filters"
        >
          <SlidersHorizontal className="size-4" />
        </Button>
      </div>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </>
  )
}
```

A few design decisions:

- **`hidden md:block`** — the toggle button only appears at the `md` breakpoint (≥768px). Mobile users will get a separate filter entry point (the `FilterOverlay` component, next step).
- **`absolute top-4 right-4 z-10`** — the button floats over the map. The `position: relative` wrapper in `page.tsx` is the positioning anchor. `z-10` keeps the button above the Mapbox canvas.
- **`SlidersHorizontal` icon** — communicates "filters" clearly without text. From lucide-react, which ships with shadcn/ui.
- **React Fragments `<>`** — no wrapper div needed; `MapContainer` fills the parent, and the button + sidebar are positioned elements that don't affect document flow.

#### Update `app/page.tsx`

```tsx
import { AppShell } from '@/components/layout/AppShell'

export default function Home() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh' }}>
      <AppShell />
    </div>
  )
}
```

The `position: relative` wrapper is unchanged — it still anchors all absolutely-positioned overlays (toggle button, future summary bar, mobile filter toggle). Only the import changes from `MapContainer` to `AppShell`.

#### Test Before PR

```bash
npx tsc --noEmit   # no output = clean
npm run dev
```

On desktop: a `≡` (sliders) button appears in the top-right. Click it to open the filter panel; click the X or the dark overlay to close. On mobile: the button is hidden and the sidebar cannot be opened (mobile filter UI is the next step).

> **Phase 5 note:** This Sheet-based sidebar was later replaced with a plain flex-column `div` panel that pins side-by-side with the map (no slide animation, no overlay). The `AppShell` layout also evolved from React fragments with absolute positioning to a `flex` row: `InfoSidePanel | map area (flex-1) | Sidebar`. When that change was made, `position: relative` moved off `page.tsx` and onto AppShell's inner map `div`, and the `map.resize()` timeout dropped from 300ms to 0ms (no animation to wait for). The Sheet component is no longer imported by `Sidebar.tsx` in the current codebase.

---

### Step 8: Build the Mobile Filter Overlay

On desktop, filters slide in via the `Sheet` sidebar. On mobile (<768px), a sheet panel is awkward — the viewport is too narrow for a side panel and too tall for a bottom drawer at this stage. Instead, we use a **full-screen overlay**: a fixed panel that covers the entire viewport with a header and scrollable content area.

#### The approach

The overlay is a fixed-positioned `div` that:

- Covers the full viewport (`fixed inset-0`)
- Is hidden at `md` and above (`md:hidden`) — desktop users get the Sheet sidebar
- Has a header row with a title and close button
- Has a scrollable content area below the header (`flex-1 overflow-y-auto`)
- Renders `null` when closed so it has zero DOM overhead

#### Create `components/overlay/FilterOverlay.tsx`

```tsx
'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FilterOverlayProps {
  isOpen: boolean
  onClose: () => void
}

export function FilterOverlay({ isOpen, onClose }: FilterOverlayProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-20 flex flex-col bg-background md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Filters"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-base font-semibold">Filters</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close filters">
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="text-sm text-muted-foreground">Filter controls coming soon.</p>
      </div>
    </div>
  )
}
```

A few details:

- **`fixed inset-0`** — covers the full viewport regardless of scroll position; `inset-0` is shorthand for `top: 0; right: 0; bottom: 0; left: 0`
- **`z-20`** — sits above the map (`z-10`) and the floating toggle button
- **`md:hidden`** — the overlay is completely absent from the DOM tree at desktop widths; the `Sheet` sidebar handles that breakpoint
- **`bg-background`** — uses the shadcn/ui CSS custom property for the page background color so it respects any future theming
- **`flex flex-col`** — header is fixed-height; the content area grows to fill the rest with `flex-1`
- **`role="dialog"` + `aria-modal="true"`** — tells screen readers this is a modal dialog; `aria-label="Filters"` provides the accessible name

#### Wire up the toggle button in `AppShell`

The overlay needs a floating toggle button on mobile — the same `SlidersHorizontal` icon as the desktop button, but visible only when the desktop button is hidden:

```tsx
'use client'

import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { MapContainer } from '@/components/map/MapContainer'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { FilterOverlay } from '@/components/overlay/FilterOverlay'
import { Button } from '@/components/ui/button'

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)

  return (
    <>
      <MapContainer />

      {/* Sidebar toggle button — desktop only */}
      <div className="absolute top-4 right-4 z-10 hidden md:block">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open filters"
        >
          <SlidersHorizontal className="size-4" />
        </Button>
      </div>

      {/* Filter overlay toggle button — mobile only */}
      <div className="absolute top-4 right-4 z-10 md:hidden">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setOverlayOpen(true)}
          aria-label="Open filters"
        >
          <SlidersHorizontal className="size-4" />
        </Button>
      </div>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <FilterOverlay isOpen={overlayOpen} onClose={() => setOverlayOpen(false)} />
    </>
  )
}
```

The two toggle buttons sit at the same position (`top-4 right-4`) but swap at the `md` breakpoint:

- `hidden md:block` — desktop button: hidden below `md`, visible at `md` and above
- `md:hidden` — mobile button: visible below `md`, hidden at `md` and above

This means exactly one button is rendered at any viewport width. Both trigger different state variables — `sidebarOpen` and `overlayOpen` — which control their respective panels independently.

#### Test

```bash
npm run dev
```

Resize the browser to a mobile width (<768px). The `SlidersHorizontal` button should be visible in the top-right. Tapping it covers the entire viewport with the filter overlay (white background, "Filters" header, X close button). Tapping X returns to the map. At desktop width, the button switches to opening the Sheet sidebar instead.

### Step 9: Build the SummaryBar Component

With the map, sidebar, and mobile overlay in place, the next persistent UI element is the **SummaryBar** — a floating pill at the bottom of the viewport that shows the current crash count and any active filter badges. It's always visible, on both mobile and desktop.

#### Why a summary bar?

When filters are applied to a map, users need immediate feedback: how many results match the current selection, and which filters are active. The SummaryBar provides this at a glance without opening a panel. It also serves as the entry point for "clear filter" interactions in later iterations.

#### Create `components/summary/SummaryBar.tsx`

```tsx
'use client'

import { Badge } from '@/components/ui/badge'

interface SummaryBarProps {
  crashCount?: number | null
  activeFilters?: string[]
}

export function SummaryBar({ crashCount = null, activeFilters = [] }: SummaryBarProps) {
  const countLabel = crashCount === null ? '—' : crashCount.toLocaleString()

  return (
    <div
      className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border bg-background/90 px-4 py-2 shadow-md backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label="Summary"
    >
      <span className="text-sm font-medium tabular-nums whitespace-nowrap">
        {countLabel} crashes
      </span>

      {activeFilters.length > 0 && (
        <>
          <div className="h-4 w-px bg-border" aria-hidden="true" />
          <div className="flex flex-wrap gap-1.5">
            {activeFilters.map((filter) => (
              <Badge key={filter} variant="secondary" className="text-xs">
                {filter}
              </Badge>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

Key design choices:

- **`absolute bottom-6 left-1/2 -translate-x-1/2`** — horizontally centered, floating 24px above the bottom edge; `absolute` works because the page wrapper in `page.tsx` has `position: relative`
- **`bg-background/90 backdrop-blur-sm`** — 90% opaque with blur so the map bleeds through slightly; keeps the bar readable over any map tile color
- **`rounded-full`** — pill shape signals this is a status indicator, not a navigation element
- **`z-10`** — same stacking level as the toggle buttons; sits above the Mapbox canvas
- **`tabular-nums`** — prevents the count from causing layout shift as digits change width (e.g., `1,315` → `999` keeps the bar from resizing)
- **`role="status" aria-live="polite"`** — announces count changes to screen readers without interrupting current speech
- **Divider + badges** — the `h-4 w-px bg-border` vertical rule only renders when there are active filters; the badge area is empty (and hidden) by default
- **`crashCount === null` → `"—"`** — communicates "loading" state without false data; a real number replaces it once the query resolves

#### Wire it into `AppShell`

Add the import and drop `<SummaryBar />` between the toggle buttons and the panels:

```tsx
import { SummaryBar } from '@/components/summary/SummaryBar'

// inside AppShell return:
;<SummaryBar />
```

No props are passed yet — `crashCount` defaults to `null` (showing `"—"`) and `activeFilters` defaults to `[]`. Both will be wired to real query results and filter state in a later step when the filter panel is built.

#### Test the SummaryBar

```bash
npm run dev
```

A floating pill labeled `"— crashes"` should appear centered at the bottom of the viewport. Resize to both mobile and desktop widths to confirm it stays centered and doesn't overlap the toggle button or other controls.

### Step 10: Wire map.resize() to Sidebar and Overlay Transitions

Whenever the sidebar or filter overlay opens or closes, the Mapbox canvas needs to be told about the size change. Without this, Mapbox holds onto its old canvas dimensions and the map can appear offset or mis-sized until the user interacts with it.

The solution involves two changes:

1. Expose the Mapbox `MapRef` from `MapContainer` via `forwardRef`
2. Call `mapRef.current?.resize()` in `AppShell` whenever sidebar or overlay state changes

#### Why `map.resize()`?

Mapbox GL JS renders into an HTML canvas. The canvas size is computed once on initialization and again whenever you explicitly call `map.resize()`. CSS changes to the surrounding layout (even animated ones) don't trigger Mapbox's internal resize logic — you have to call it manually.

The Sheet sidebar animates open/closed with a CSS transition (~300ms). Calling `resize()` immediately when state changes means Mapbox recomputes size before the animation finishes, which can cause a momentary glitch. A short `setTimeout` deferred past the animation duration fixes this.

> **Phase 5 note:** When the Sheet sidebar was replaced with a pinnable flex-column panel (which has no CSS animation), the timeout was reduced to `0` — just enough to defer past the synchronous state update. The pattern is the same; only the delay changes.

#### Convert `MapContainer` to `forwardRef`

The `Map` component from `react-map-gl/mapbox` accepts a `ref` that exposes the underlying `MapRef` instance. We need to surface this ref to `AppShell`, which means converting `MapContainer` from a plain function to a `forwardRef` component:

```tsx
'use client'

import { forwardRef } from 'react'
import Map from 'react-map-gl/mapbox'
import type { MapRef } from 'react-map-gl/mapbox'

export const MapContainer = forwardRef<MapRef>(function MapContainer(_, ref) {
  return (
    <Map
      ref={ref}
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={{ longitude: -120.5, latitude: 47.5, zoom: 7 }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/light-v11"
    />
  )
})
```

Key details:

- **`forwardRef<MapRef>`** — declares that the ref this component forwards is of type `MapRef`
- **`MapRef` from `react-map-gl/mapbox`** — important: import from `react-map-gl/mapbox`, not `react-map-gl`. In this project configuration, the root `react-map-gl` package is not resolvable as a TypeScript module (only the subpath export `react-map-gl/mapbox` is). This is a v8 package-structure quirk.
- **`(_, ref)`** — the component takes no props (`_` is unused), but `forwardRef` always passes props as the first argument and ref as the second
- **Named function** — using `forwardRef(function MapContainer(...))` instead of an arrow function preserves the component name in React DevTools

#### Hold the ref in `AppShell` and call `resize()`

```tsx
'use client'

import { useRef, useEffect, useState } from 'react'
import type { MapRef } from 'react-map-gl/mapbox'
import { MapContainer } from '@/components/map/MapContainer'
// ...other imports...

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const mapRef = useRef<MapRef>(null)

  // Call resize() after sidebar/overlay transitions so Mapbox recomputes canvas size.
  // 300ms matches the shadcn Sheet slide animation duration.
  useEffect(() => {
    const id = setTimeout(() => mapRef.current?.resize(), 300)
    return () => clearTimeout(id)
  }, [sidebarOpen, overlayOpen])

  return (
    <>
      <MapContainer ref={mapRef} />
      {/* ...rest of the shell... */}
    </>
  )
}
```

How this works:

- **`useRef<MapRef>(null)`** — a stable ref that holds the Mapbox map instance across renders; `null` before the map mounts
- **`useEffect` with `[sidebarOpen, overlayOpen]`** — runs once on mount (no-op since the map is already sized correctly) and again whenever either state variable flips
- **`setTimeout(..., 300)`** — defers the `resize()` call until after the Sheet animation completes. The cleanup function (`clearTimeout`) cancels the timer if the state changes again before the timeout fires, preventing stale calls
- **`mapRef.current?.resize()`** — optional chaining guards against the map not yet being mounted; `resize()` is a synchronous Mapbox method that recomputes canvas dimensions from the current container size

#### Test the Change

```bash
npm run dev
```

Open the sidebar on desktop. As the Sheet slides in, the map should fill the remaining space correctly with no visual glitch. Close the sidebar — same behavior. On mobile, open and close the filter overlay; the map canvas should remain correctly sized throughout.

---

### Step 11: Set Mobile Default Zoom to Seattle

Out of the box, `MapContainer` opens to a view of all of Washington state (zoom 7) — good for desktop where you want to see the full dataset at a glance, but too zoomed out for a phone where the initial view should feel immediately useful.

The fix is straightforward: detect the viewport width at render time and pick one of two `initialViewState` objects.

#### Why read `window.innerWidth` directly?

`MapContainer` is already a `'use client'` component. Client components are never server-rendered in isolation — by the time this function runs in the browser, `window` is always defined. More importantly, `initialViewState` is only consumed **once on mount** by Mapbox; it is not reactive. There is no re-render to cause hydration drift, and no `useEffect` or `useState` is needed.

#### Update `components/map/MapContainer.tsx`

Define the two view states as module-level constants (keeping them out of the render function avoids re-creating plain objects on every render) and select between them:

```tsx
'use client'

import { forwardRef } from 'react'
import Map from 'react-map-gl/mapbox'
import type { MapRef } from 'react-map-gl/mapbox'

const DESKTOP_VIEW = { longitude: -120.5, latitude: 47.5, zoom: 7 }
const MOBILE_VIEW = { longitude: -122.3321, latitude: 47.6062, zoom: 11 }

export const MapContainer = forwardRef<MapRef>(function MapContainer(_, ref) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const initialViewState = isMobile ? MOBILE_VIEW : DESKTOP_VIEW

  return (
    <Map
      ref={ref}
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={initialViewState}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/light-v11"
    />
  )
})
```

The `typeof window !== 'undefined'` guard is defensive boilerplate — it is not technically needed in a client component but communicates intent clearly and prevents any future accidental SSR.

The 768px breakpoint matches the `md` Tailwind breakpoint used throughout the project (`md:hidden`, `hidden md:block`) for consistent mobile/desktop splitting.

#### Test the mobile default zoom

Open the app at a mobile viewport width (<768px, e.g. iPhone in Chrome DevTools). The map should open centered on Seattle at street level rather than the full Washington state view. At desktop width, the view is unchanged.

### Step 12: Light/Dark Mode with next-themes

With the map, sidebar, and mobile overlay all functional, the final Phase 3 UI milestone is **light/dark mode**. The shadcn/ui setup already includes a complete `.dark` CSS variable set in `globals.css` — we just need a library to toggle the `dark` class on `<html>` and persist the choice across page loads.

#### Why `next-themes`?

[next-themes](https://github.com/pacocoursey/next-themes) is the standard library for theme management in Next.js. It:

- Adds or removes the `dark` class on `<html>` based on the active theme
- Reads the OS system preference (`prefers-color-scheme`) for the default on first visit
- Persists the user's explicit choice in `localStorage` so it survives page refreshes
- Prevents the flash of wrong theme on load (via an inline script injected before React hydrates)
- Ships a `useTheme()` hook that any Client Component can call to read or set the active theme

#### Install next-themes

```bash
npm install next-themes
```

#### Create `components/theme-provider.tsx`

A thin wrapper that lets us pass `ThemeProvider` props cleanly from the server layout:

```tsx
'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
```

This is the standard shadcn/ui pattern for integrating `next-themes` — the wrapper lives in `components/` rather than importing `NextThemesProvider` directly in the layout.

#### Update `app/layout.tsx`

Two changes: add `suppressHydrationWarning` to `<html>`, and wrap the app in `ThemeProvider`:

```tsx
import { ThemeProvider } from '@/components/theme-provider'

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ApolloProvider>{children}</ApolloProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
```

`suppressHydrationWarning` is required because `next-themes` adds a `class` attribute to `<html>` before React hydrates, which would otherwise trigger a hydration mismatch warning.

`attribute="class"` tells `next-themes` to apply themes by toggling CSS classes (specifically, the `dark` class that `globals.css` already expects).

`defaultTheme="system"` and `enableSystem` mean first-time visitors get whatever their OS prefers. `disableTransitionOnChange` prevents all CSS transitions from running during the theme switch, which avoids a jarring animated color change across the whole UI.

#### Create `components/ui/theme-toggle.tsx`

A minimal icon button using `useTheme()`. The icon swap is handled via CSS classes (`dark:hidden` / `hidden dark:block`) rather than JavaScript, so there's no flash on load:

```tsx
'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <Button
      variant="outline"
      size="icon"
      className={className}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label="Toggle theme"
    >
      <Sun className="size-4 dark:hidden" suppressHydrationWarning />
      <Moon className="size-4 hidden dark:block" suppressHydrationWarning />
    </Button>
  )
}
```

`resolvedTheme` is the actual applied theme — `'light'` or `'dark'` — never `undefined` after the client hydrates. Using it in `onClick` means the button always toggles to the opposite of whatever is currently applied, even when `defaultTheme="system"`.

The Sun icon has `dark:hidden` (visible in light mode, hidden in dark). The Moon icon has `hidden dark:block` (hidden in light mode, visible in dark). Both classes are driven by the `dark` class on `<html>`, so the icons swap instantly with the theme — no React re-render needed for the icon itself.

Two implementation details worth noting:

- **`className` prop** — forwarded to the `Button` so callers can pass additional Tailwind classes (e.g., dark-mode border overrides like `dark:bg-zinc-900 dark:border-zinc-700`). This becomes useful in Phase 5 when buttons throughout `AppShell` receive consistent dark-mode styling.
- **`suppressHydrationWarning`** — extensions like Dark Reader inject inline style attributes onto SVG icons, causing React hydration mismatches. Adding `suppressHydrationWarning` to the `<svg>` (which Lucide renders) tells React to skip the attribute check for that element.

#### Wire `ThemeToggle` into `AppShell`

The toggle button sits in the same top-right controls area as the filter button. Rather than two separate positioned divs (one for desktop, one for mobile), consolidate both filter buttons into a single `flex gap-2` container alongside the theme toggle:

```tsx
import { ThemeToggle } from '@/components/ui/theme-toggle'

// inside AppShell return:
;<div className="absolute top-4 right-4 z-10 flex gap-2">
  <ThemeToggle />
  {/* Sidebar toggle — desktop only */}
  <div className="hidden md:block">
    <Button
      variant="outline"
      size="icon"
      onClick={() => setSidebarOpen(true)}
      aria-label="Open filters"
    >
      <SlidersHorizontal className="size-4" />
    </Button>
  </div>
  {/* Filter overlay toggle — mobile only */}
  <div className="md:hidden">
    <Button
      variant="outline"
      size="icon"
      onClick={() => setOverlayOpen(true)}
      aria-label="Open filters"
    >
      <SlidersHorizontal className="size-4" />
    </Button>
  </div>
</div>
```

The `ThemeToggle` is always visible — no breakpoint class. The filter buttons remain conditionally shown per breakpoint, just now inside a shared flex container.

#### Swap the Mapbox basemap dynamically

The map uses `mapStyle` to pick a Mapbox style URL. For dark mode we swap `light-v11` for `dark-v11`. `useTheme()` works in any Client Component, and `MapContainer` is already `'use client'`:

```tsx
import { useTheme } from 'next-themes'

export const MapContainer = forwardRef<MapRef>(function MapContainer(_, ref) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const initialViewState = isMobile ? MOBILE_VIEW : DESKTOP_VIEW

  const { resolvedTheme } = useTheme()
  const mapStyle =
    resolvedTheme === 'dark'
      ? 'mapbox://styles/mapbox/dark-v11'
      : 'mapbox://styles/mapbox/light-v11'

  return (
    <Map
      ref={ref}
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={initialViewState}
      style={{ width: '100%', height: '100%' }}
      mapStyle={mapStyle}
    />
  )
})
```

`mapStyle` is a controlled prop on react-map-gl's `<Map>` — passing a new value triggers a smooth Mapbox style transition. When `resolvedTheme` is `undefined` (pre-hydration instant), the ternary defaults to `light-v11`, so there's no broken map on first render.

#### Verify dark mode

```bash
npm run dev
```

1. The Moon icon appears in the top-right next to the filter button
2. Clicking the toggle switches the map to dark (`dark-v11`), updates all shadcn UI colors (buttons, sidebar, overlay, summary bar), and shows the Sun icon
3. Reloading the page preserves the chosen theme
4. On first visit with OS dark mode preference, the app opens in dark mode automatically

```bash
npm run build   # no type errors
npm test        # all tests still pass
```

---

---

## Phase 3 (continued): Interactive Map with Data

### Step: Add the GeoJSON Data Layer

At this point the map renders a beautiful basemap but no crash data. The next step fetches crashes from our GraphQL API and renders them as circle points on the map.

#### Architecture decision: load all data client-side

Rather than re-querying the API whenever a filter changes, we load up to 5,000 crashes once as a GeoJSON FeatureCollection and let Mapbox filter them with layer expressions. This keeps the map snappy and avoids round-trips for every interaction.

#### Step 1: Create the query document

Create `lib/graphql/queries.ts`. Only request the fields needed for map rendering:

```ts
import { gql } from '@apollo/client'

export const GET_CRASHES = gql`
  query GetCrashes($filter: CrashFilter, $limit: Int) {
    crashes(filter: $filter, limit: $limit) {
      items {
        colliRptNum
        latitude
        longitude
        severity
        mode
        crashDate
      }
      totalCount
    }
  }
`
```

We store `severity`, `mode`, and `crashDate` as GeoJSON feature properties even though we don't use them for styling yet — they'll be available for Mapbox layer expressions in the next steps.

#### Step 2: Create the CrashLayer component

Create `components/map/CrashLayer.tsx`:

```tsx
'use client'

import { useQuery } from '@apollo/client/react'
import { Source, Layer } from 'react-map-gl/mapbox'
import type { LayerProps } from 'react-map-gl/mapbox'
import type { FeatureCollection, Point } from 'geojson'
import { GET_CRASHES } from '@/lib/graphql/queries'

type CrashItem = {
  colliRptNum: string
  latitude: number | null
  longitude: number | null
  severity: string | null
  mode: string | null
  crashDate: string | null
}

type GetCrashesQuery = {
  crashes: {
    items: CrashItem[]
    totalCount: number
  }
}

const circleLayer: LayerProps = {
  id: 'crashes-circles',
  type: 'circle',
  paint: {
    'circle-radius': 5,
    'circle-color': '#B71C1C',
    'circle-opacity': 0.7,
  },
}

export function CrashLayer() {
  const { data, error } = useQuery<GetCrashesQuery>(GET_CRASHES, {
    variables: { limit: 5000 },
  })

  if (error) {
    console.error('CrashLayer query error:', error)
    return null
  }

  if (!data) return null

  const geojson: FeatureCollection<Point> = {
    type: 'FeatureCollection',
    features: data.crashes.items
      .filter((crash) => crash.latitude != null && crash.longitude != null)
      .map((crash) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [crash.longitude!, crash.latitude!],
        },
        properties: {
          colliRptNum: crash.colliRptNum,
          severity: crash.severity,
          mode: crash.mode,
          crashDate: crash.crashDate,
        },
      })),
  }

  return (
    <Source id="crashes" type="geojson" data={geojson}>
      <Layer {...circleLayer} />
    </Source>
  )
}
```

Key points:

- **`useQuery` import**: In Apollo Client v4, React hooks moved to `@apollo/client/react` (not `@apollo/client`).
- **`LayerProps` type**: `react-map-gl/mapbox` does not export `CircleLayer`. The correct type for what `<Layer>` accepts is `LayerProps` from `react-map-gl/mapbox`.
- **GeoJSON coordinates are `[longitude, latitude]`** (x, y — longitude-first per the GeoJSON spec).
- **Non-null assertions after filter**: TypeScript doesn't narrow after `.filter()`, so use `crash.longitude!` / `crash.latitude!` since the filter already guarantees non-null.
- **Loading state**: Return `null` while `data` is undefined — the map stays visible with no spinner needed.

#### Step 3: Render CrashLayer inside the Map

In `components/map/MapContainer.tsx`, convert `<Map />` to a parent element:

```tsx
import { CrashLayer } from './CrashLayer'
;<Map ref={ref} /* ...other props... */>
  <CrashLayer />
</Map>
```

Children of react-map-gl's `<Map>` are rendered into the map's canvas context — this is the correct pattern for `Source` and `Layer` components.

#### Pitfall: Apollo Client v4 import changes

Apollo Client v4 moved several exports to dedicated subpaths (breaking change from v3):

| Export                          | v3               | v4                           |
| ------------------------------- | ---------------- | ---------------------------- |
| `useQuery`, `useMutation`, etc. | `@apollo/client` | `@apollo/client/react`       |
| `HttpLink`                      | `@apollo/client` | `@apollo/client/link/http`   |
| `gql`                           | `@apollo/client` | `@apollo/client` (unchanged) |

Update all files importing `HttpLink` (`lib/apollo-client.ts`, `app/apollo-provider.tsx`) and all React hook imports.

#### Pitfall: PrismaPg requires a PoolConfig, not a raw string

The `@prisma/adapter-pg` constructor signature is `pg.Pool | pg.PoolConfig` — it never accepted a raw string. Passing one causes:

```text
Cannot use 'in' operator to search for 'password' in postgresql://...
```

This happens because `pg` internally does `'password' in config` to detect a config object, and `in` throws on a primitive string.

```ts
// Wrong:
new PrismaPg(process.env.DATABASE_URL!)

// Correct:
new PrismaPg({ connectionString: process.env.DATABASE_URL! })
```

#### Pitfall: Render external connections require SSL

After fixing the adapter, the next error was `User was denied access on the database (not available)`. The `(not available)` is Prisma's signal that it couldn't establish a connection at all. The cause: Render's PostgreSQL requires SSL for all external connections (local dev). Internal connections (Render app to Render DB) work without it, which is why the deployed app was unaffected.

Fix: append `?sslmode=require` to `DATABASE_URL` in your local `.env`:

```text
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"
```

Restart `npm run dev` after changing `.env` — Next.js does not hot-reload environment variable changes.

#### Verify Loading

Open the map after `npm run dev`. Thousands of dark-red dots should appear across Washington state. Check the Network tab: one `POST /api/graphql` for `GetCrashes` on page load.

#### Pitfall: Windows CRLF Line Endings Break Prettier CI

If you develop on Windows with `git config core.autocrlf=true` (the Windows default), git converts LF → CRLF on checkout. Prettier's default `endOfLine` is `lf`, so running `npm run format:check` locally will report every file as misformatted — even though they're clean in the repository and CI passes.

This became visible when a `tutorial.md` edit was flagged in CI with a real formatting issue. After fixing that one file, the local `format:check` showed 38 files failing — all false positives from CRLF.

The fix is a `.gitattributes` file at the root of the repository:

```gitattributes
# Force LF line endings for all text files on all platforms
* text=auto eol=lf
```

With `eol=lf` set, git normalizes to LF in the index and applies the rule consistently across all platforms, overriding `core.autocrlf`. After adding the file:

```bash
git add --renormalize .
```

This re-stages all tracked files under the new rule. After running `git add --renormalize .`, git correctly treats the CRLF working-tree files as equivalent to the LF versions in HEAD, so `git status` shows only `.gitattributes` as a new file — not a diff of every source file.

The key diagnostic clue: CI (running on Linux) only failed on the one file with a genuine issue. The 38-file local failure was purely a Windows environment artifact.

---

## Step N: Style Crash Circles by Severity and Zoom

Raw circles on the map are a good start, but all crashes looking identical makes the data hard to read at a glance. The goal is a visual hierarchy where the most serious crashes — fatalities — are the most prominent, and severity diminishes visually as you move down the scale.

The design spec:

| Severity     | Color                  | Opacity | Base Size |
| ------------ | ---------------------- | ------- | --------- |
| Death        | `#B71C1C` (dark red)   | 85%     | 8px       |
| Major Injury | `#F57C00` (orange)     | 70%     | 7px       |
| Minor Injury | `#FDD835` (yellow)     | 55%     | 6px       |
| None         | `#C5E1A5` (pale green) | 50%     | 5px       |

All sizes also scale with zoom so circles stay legible at the state overview level and don't overwhelm the map at street level.

### Mapbox Expression Language

Mapbox GL JS uses a declarative **expression language** to drive data-driven styling. Instead of writing JavaScript that loops over features, you write JSON expressions that Mapbox evaluates per-feature on the GPU. This is what makes it fast enough to style thousands of circles in real time.

Two expressions you'll use here:

- **`filter`** — a boolean expression that restricts which features a layer renders
- **`interpolate`** — smoothly scale a value (like radius) as another value (like zoom level) changes

### Four Layers for Correct Z-Ordering

A naive approach would use a single layer with `match` expressions to set color/opacity/size per severity. That works visually, but there's a problem: **Mapbox renders all features in a layer in data order** — so a None dot that happens to come after a Death dot in the GeoJSON array will paint on top of it.

The fix is to use **four separate layers**, one per severity bucket, rendered bottom-to-top:

```text
crashes-none → crashes-minor → crashes-major → crashes-death
```

Mapbox renders layers in the order they appear in the style. Since `crashes-death` is added last, Death dots always appear on top of everything else. Each layer uses a Mapbox `filter` expression to select only its severity bucket:

```ts
import type { LayerProps } from 'react-map-gl/mapbox'

const deathLayer: LayerProps = {
  id: 'crashes-death',
  type: 'circle',
  filter: ['==', ['get', 'severity'], 'Death'],
  paint: {
    'circle-color': '#B71C1C',
    'circle-opacity': 0.85,
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2.5, 10, 8, 15, 18],
    'circle-stroke-width': 0,
  },
}
```

With severity isolated to one layer, `circle-color` and `circle-opacity` become static values — no `match` expression needed.

### Zoom-Scaled Radius with `interpolate`

The radius scales with zoom using `interpolate`. The stops are intentionally exaggerated to maximize legibility at the extremes — very small dots when viewing the whole state (no visual clutter), large dots when on the street (easy to click):

| Zoom        | None | Minor | Major | Death |
| ----------- | ---- | ----- | ----- | ----- |
| 5 (state)   | 1px  | 1.5px | 2px   | 2.5px |
| 10 (city)   | 5px  | 6px   | 7px   | 8px   |
| 15 (street) | 9px  | 12px  | 15px  | 18px  |

Between stops, Mapbox linearly interpolates the radius automatically.

### Putting It Together in `CrashLayer`

All four layers share the same `<Source>` — they all filter from the same GeoJSON dataset:

```tsx
<Source id="crashes" type="geojson" data={geojson}>
  <Layer {...noneLayer} />
  <Layer {...minorLayer} />
  <Layer {...majorLayer} />
  <Layer {...deathLayer} />
</Source>
```

The `severity` value in each feature's `properties` is the bucketed display value — the same `rawToBucket()` mapping applied by the GraphQL resolver, stored in the feature so Mapbox can use it without another round-trip.

### Result

At the state zoom level, only the largest clusters of dark-red Death circles are visible. Zooming into a city reveals the full spectrum — red fatalities, orange serious injuries, yellow minor ones. The visual hierarchy lets users immediately identify hotspots without reading any labels. And because Death is its own topmost layer, a fatal crash at the same location as a minor injury will always be visible.

---

## Step N: Crash Detail Popup

With circles on the map, the next step is making them interactive. Clicking a circle should open a popup showing details about that crash: date, time, injury type, mode, location, and a link to the official collision report.

### How react-map-gl Layer Clicks Work

Mapbox GL JS handles click events at the map level, not the element level. To get feature data when a circle is clicked, you need to tell react-map-gl which layers are "interactive" (i.e., participate in click hit-testing):

```tsx
<Map
  interactiveLayerIds={['crashes-none', 'crashes-minor', 'crashes-major', 'crashes-death']}
  onClick={handleMapClick}
>
```

With `interactiveLayerIds` set, the `onClick` handler receives an event whose `features` array contains any GeoJSON features from those layers that were under the click point. Without it, `e.features` is always empty.

### Adding a Raw Injury Type Field to GraphQL

The existing `severity` field returns a display bucket ("Death", "Major Injury", etc.). For the popup, we also want the raw `MostSevereInjuryType` value from the database ("Dead at Scene", "Suspected Serious Injury", etc.).

Add a new field to the schema:

```ts
// lib/graphql/typeDefs.ts
severity: String    # Mapped display bucket
injuryType: String  # Raw MostSevereInjuryType value from the database
```

Add the resolver — it's a simple passthrough:

```ts
// lib/graphql/resolvers.ts
severity: (parent) => rawToBucket(parent.mostSevereInjuryType),
injuryType: (parent) => parent.mostSevereInjuryType,
```

Because the generated types file is committed (and not regenerated automatically in this workflow), also add the new field manually to `lib/graphql/__generated__/types.ts` in both the `Crash` output type and the `CrashResolvers` type.

The popup uses `injuryType` as the label and `severity` for the color dot — giving users the precise raw value while still providing the visual color hierarchy.

### Cursor Management with `useMap`

The cursor should change to a pointer when hovering a crash circle. Since cursor state lives on the Mapbox canvas element, not a DOM element, you attach raw Mapbox event listeners via the `useMap` hook inside `CrashLayer`:

```ts
import { useMap } from 'react-map-gl/mapbox'

const { current: map } = useMap()

useEffect(() => {
  if (!map) return
  const enter = () => {
    map.getCanvas().style.cursor = 'pointer'
  }
  const leave = () => {
    map.getCanvas().style.cursor = ''
  }
  const layerIds = ['crashes-none', 'crashes-minor', 'crashes-major', 'crashes-death']
  for (const id of layerIds) {
    map.on('mouseenter', id, enter)
    map.on('mouseleave', id, leave)
  }
  return () => {
    for (const id of layerIds) {
      map.off('mouseenter', id, enter)
      map.off('mouseleave', id, leave)
    }
  }
}, [map])
```

`useMap().current` gives you the `MapRef` of the enclosing `<Map>` component. The cleanup function is important — it removes the listeners when the component unmounts or when `map` changes.

### The Click Handler

In `MapContainer`, hold the selected crash in state:

```ts
const [selectedCrash, setSelectedCrash] = useState<SelectedCrash | null>(null)

const handleMapClick = useCallback((e) => {
  const feature = e.features?.[0]
  if (!feature || feature.geometry.type !== 'Point') {
    setSelectedCrash(null) // clicking empty space closes the popup
    return
  }
  const coords = feature.geometry.coordinates as [number, number]
  const p = feature.properties as Record<string, string | number | null>
  setSelectedCrash({
    longitude: coords[0],
    latitude: coords[1],
    // ... all properties stored in the GeoJSON feature
  })
}, [])
```

GeoJSON feature `properties` are serialized to plain values when stored — you need to cast them back to the correct types. Note that `involvedPersons` is a number in the Prisma model but comes back as `string | number | null` from GeoJSON properties depending on the runtime.

### Rendering the Popup

`Popup` from `react-map-gl/mapbox` is rendered as a child of `<Map>` — it knows to position itself in map coordinates:

```tsx
{
  selectedCrash && (
    <Popup
      longitude={selectedCrash.longitude}
      latitude={selectedCrash.latitude}
      onClose={() => setSelectedCrash(null)}
      closeButton
      closeOnClick={false}
      anchor="bottom"
      offset={10}
      maxWidth="220px"
    >
      <div style={{ padding: '6px 4px', fontSize: '13px', lineHeight: '1.6' }}>
        {/* date, time, injury type with color dot, mode, location, etc. */}
      </div>
    </Popup>
  )
}
```

`anchor="bottom"` positions the popup above the clicked point with the tail pointing down. `closeOnClick={false}` prevents accidental closure when the user clicks inside the popup (e.g., to copy the report number or follow the link). Clicking anywhere else on the map triggers `onClick` with an empty `features` array, which closes the popup via the handler.

### Pitfall: `MapLayerMouseEvent` Is Not Exported from `react-map-gl/mapbox`

You might reach for `MapLayerMouseEvent` to type the `onClick` handler — it's the correct type (it has the `features` property). But it's not exported from `react-map-gl/mapbox`, and importing it from `mapbox-gl` directly marks it as deprecated.

The working solution is to derive the type from the component's own prop signature:

```ts
(e: Parameters<NonNullable<React.ComponentProps<typeof Map>['onClick']>>[0]) => {
```

This is verbose but accurate and doesn't require any external type imports.

---

## Step N: Filter State Context

Filters are the core of CrashMap's UX — every UI control (mode toggle, severity checkboxes, date picker, geographic dropdowns) needs to read and write the same shared filter state, and every data fetch needs to consume it. This calls for a single shared state layer before building any filter UI.

### Why `useReducer` Instead of Multiple `useState` Calls

With seven or more filter dimensions that interact with each other (selecting a state should reset county and city; severity and no-injury are interdependent), managing separate `useState` calls would scatter logic across components and make cascading resets easy to forget. `useReducer` centralizes all state transitions in one place with an explicit action vocabulary — and the reducer can be tested in isolation.

### Defining the State Shape

The full filter state lives in a single typed interface:

```ts
export interface FilterState {
  mode: 'Bicyclist' | 'Pedestrian' | null // null = both modes
  severity: SeverityBucket[] // default: Death, Major Injury, Minor Injury
  includeNoInjury: boolean // opt-in to None bucket; default false
  dateFilter: DateFilter // { type: 'none' } | { type: 'year'; year } | { type: 'range'; startDate; endDate }
  state: string | null // geographic state name
  county: string | null
  city: string | null
  totalCount: number | null // populated by CrashLayer after each query
}
```

`totalCount` is stored here — even though it's query result data, not a user preference — because it needs to flow from `CrashLayer` (which owns the query) to `AppShell` (which renders `SummaryBar`) without prop drilling through the map container.

### Actions and Cascading Resets

Each filter dimension gets its own action type. The key insight for cascading dropdowns is that the reducer — not the UI component — is responsible for the reset:

```ts
case 'SET_STATE':
  // Selecting a new state clears county and city automatically.
  return { ...filterState, state: action.payload, county: null, city: null }

case 'SET_COUNTY':
  // Selecting a new county clears city automatically.
  return { ...filterState, county: action.payload, city: null }
```

The UI fires `SET_STATE` and the downstream dropdowns are reset without the component knowing about them.

### The `toCrashFilter` Helper

Converting `FilterState` to the GraphQL `CrashFilter` input object is non-trivial: `includeNoInjury` needs to merge with `severity`, and the `dateFilter` discriminated union needs unpacking. A pure helper function handles this so it can be called anywhere and tested independently:

```ts
export function toCrashFilter(filterState: FilterState): CrashFilterInput {
  const effectiveSeverity = [
    ...filterState.severity,
    ...(filterState.includeNoInjury ? ['None'] : []),
  ]
  const dateVars =
    filterState.dateFilter.type === 'year'
      ? { year: filterState.dateFilter.year }
      : filterState.dateFilter.type === 'range'
        ? { dateFrom: filterState.dateFilter.startDate, dateTo: filterState.dateFilter.endDate }
        : {}
  return {
    severity: effectiveSeverity,
    ...(filterState.mode ? { mode: filterState.mode } : {}),
    ...(filterState.state ? { state: filterState.state } : {}),
    ...(filterState.county ? { county: filterState.county } : {}),
    ...(filterState.city ? { city: filterState.city } : {}),
    ...dateVars,
    includeNoInjury: filterState.includeNoInjury,
  }
}
```

### The `getActiveFilterLabels` Helper

The `SummaryBar` shows badge chips for each active (non-default) filter. A pure helper derives these from the state:

```ts
export function getActiveFilterLabels(filterState: FilterState): string[] {
  const labels: string[] = []
  if (filterState.mode) labels.push(filterState.mode + 's')
  // Only flag severity when it differs from the default three-bucket set
  const severityChanged = /* ... */
  if (severityChanged) labels.push(all.join(' + '))
  if (filterState.dateFilter.type === 'year') labels.push(String(filterState.dateFilter.year))
  // ... date range, state, county, city
  return labels
}
```

### Wiring It Together

**`app/layout.tsx`** — wrap children inside `ApolloProvider`:

```tsx
<ApolloProvider>
  <FilterProvider>{children}</FilterProvider>
</ApolloProvider>
```

**`CrashLayer`** — read filter state, drive the query, dispatch the count back:

```tsx
const { filterState, dispatch } = useFilterContext()
const { data } = useQuery<GetCrashesQuery>(GET_CRASHES, {
  variables: { filter: toCrashFilter(filterState), limit: 5000 },
})

useEffect(() => {
  dispatch({ type: 'SET_TOTAL_COUNT', payload: data?.crashes.totalCount ?? null })
}, [data, dispatch])
```

**`AppShell`** — surface the count and active filter badges to `SummaryBar`:

```tsx
const { filterState } = useFilterContext()
// ...
<SummaryBar
  crashCount={filterState.totalCount}
  activeFilters={getActiveFilterLabels(filterState)}
/>
```

With this plumbing in place, every filter control only needs to call `dispatch` — the map query, crash count, and filter badges all update automatically.

---

## Step N+1: Mapbox Popup Dark Mode

The crash detail popup looks fine in light mode but stays white in dark mode. There are two separate issues with different root causes.

### Issue 1: The Popup Container Background

Mapbox GL JS creates and owns the popup container element (`.mapboxgl-popup-content`) — it's appended to the map's DOM container by the library, not by React. Its default stylesheet sets:

```css
.mapboxgl-popup-content {
  background: #fff;
}
```

The natural fix is a global CSS override targeting `.dark .mapboxgl-popup-content`. However, CSS cascade ordering between `mapbox-gl/dist/mapbox-gl.css` (imported in `layout.tsx`) and `globals.css` is not guaranteed after Next.js bundles everything. Adding `!important` ensures our dark mode rule wins regardless of bundle order:

```css
/* globals.css */
.dark .mapboxgl-popup-content {
  background: var(--card) !important;
  color: var(--card-foreground) !important;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}

/* The triangular arrow tip for anchor="bottom" uses border-top-color */
.dark .mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip {
  border-top-color: var(--card) !important;
}

.dark .mapboxgl-popup-close-button {
  color: var(--muted-foreground);
}
```

This uses the shadcn/ui CSS variables (`--card`, `--card-foreground`) already defined on `:root` and `.dark`.

### Issue 2: Muted Text Inside the Popup Doesn't Update

The popup content uses muted text for secondary info (time, location, report number). The Tailwind class `text-muted-foreground` doesn't respond to theme changes here.

**Root cause:** Tailwind v4 uses `@theme inline` to define color variables, which may compile utility classes like `text-muted-foreground` with the color value resolved at build time rather than as a live `var()` reference. When used inside a third-party container like the Mapbox popup — which sits at the boundary of what Tailwind can reason about — this means the class color stays static.

**The fix:** reference CSS custom properties directly in inline styles. Unlike Tailwind's compiled classes, `style` attribute `var()` references are always resolved at runtime against the current value of the CSS variable:

```tsx
// ❌ Static — may not update when .dark toggles
<div className="text-muted-foreground">King County</div>

// ✅ Live — always reflects the current theme
<div style={{ color: 'var(--muted-foreground)' }}>King County</div>
```

Because `--muted-foreground` is defined on both `:root` (light) and `.dark` in `globals.css`, this inline reference updates immediately whenever next-themes toggles the theme class on `<html>`.

This pattern is useful any time you need theme-responsive colors inside components rendered by third-party libraries that manage their own DOM.

---

## Phase 4: Interactive Map with Filters

With the map rendering live crash data and the filter state context in place, the next phase is building the actual filter controls. Each filter gets its own shared component in `components/filters/` so it can be dropped into both the desktop sidebar and the mobile overlay without duplicating logic.

The filter controls we'll build, in order:

1. **Mode toggle** — Bicyclist / Pedestrian / All
2. **Severity checkboxes** — Death, Major Injury, Minor Injury; opt-in None/Unknown
3. **Date filter** — named preset buttons (YTD, 90 Days, Last Year, 3 Years) plus a custom date range picker
4. **Geographic filter** — County and City dropdowns (Washington-only dataset, both decoupled) plus Map Controls (viewport mode, satellite view)

Each step in this phase follows the same pattern:

- Create a `components/filters/XFilter.tsx` component that reads from and dispatches to `useFilterContext()`
- Import and render it in both `Sidebar.tsx` and `FilterOverlay.tsx`
- The GraphQL query in `CrashLayer` already consumes `toCrashFilter(filterState)`, so the map updates automatically

### Step 1: Mode Toggle

The first filter lets users narrow the map to **Bicyclists only**, **Pedestrians only**, or **All** (the default). It uses the shadcn/ui `ToggleGroup` — a group of mutually exclusive buttons built on Radix UI's `ToggleGroup.Root`.

#### The FilterContext Side

The filter context (created in Phase 3) already has everything we need:

```ts
// context/FilterContext.tsx
export type ModeFilter = 'Bicyclist' | 'Pedestrian' | null  // null = All

export interface FilterState {
  mode: ModeFilter
  // ...
}

// Reducer case:
case 'SET_MODE':
  return { ...filterState, mode: action.payload }
```

And `toCrashFilter()` already maps the mode to the GraphQL `CrashFilter` input:

```ts
...(filterState.mode ? { mode: filterState.mode } : {})
```

So the filter component only needs to read from and write to context — no other wiring required.

#### Creating the Component

Create `components/filters/ModeToggle.tsx`:

```tsx
'use client'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useFilterContext, type ModeFilter } from '@/context/FilterContext'

export function ModeToggle() {
  const { filterState, dispatch } = useFilterContext()

  const value = filterState.mode ?? 'all'

  function handleChange(newValue: string) {
    // Ignore deselection clicks (Radix fires "" when the active item is clicked again).
    if (!newValue) return
    dispatch({
      type: 'SET_MODE',
      payload: newValue === 'all' ? null : (newValue as ModeFilter),
    })
  }

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">Mode</p>
      <ToggleGroup type="single" variant="outline" value={value} onValueChange={handleChange}>
        <ToggleGroupItem value="all" aria-label="All modes">
          All
        </ToggleGroupItem>
        <ToggleGroupItem value="Bicyclist" aria-label="Bicyclists only">
          Bicyclist
        </ToggleGroupItem>
        <ToggleGroupItem value="Pedestrian" aria-label="Pedestrians only">
          Pedestrian
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}
```

A few things worth noting:

**The "all" string mapping.** The filter context uses `null` to represent "show all modes", but Radix `ToggleGroup` needs a string value. We map `null` → `"all"` when reading, and `"all"` → `null` when dispatching. This keeps the context type clean (no magic strings in state) while satisfying the component's string requirement.

**Ignoring deselection.** Radix `ToggleGroup` with `type="single"` fires `onValueChange("")` when the user clicks the currently-selected item — it's trying to deselect it. For a "one must always be selected" toggle group, we want to ignore that: the guard `if (!newValue) return` keeps the existing selection intact.

**`variant="outline"`** renders the toggle items as outlined buttons rather than flat text. The `spacing={0}` default (from the shadcn/ui component) joins them into a connected pill group.

#### Adding to Sidebar and FilterOverlay

Both surfaces import and render `<ModeToggle />` in a `space-y-6` container, which will naturally stack additional filter sections below it as they're added.

`components/sidebar/Sidebar.tsx`:

```tsx
import { ModeToggle } from '@/components/filters/ModeToggle'

// ...
;<div className="space-y-6 px-4 pb-4">
  <ModeToggle />
</div>
```

`components/overlay/FilterOverlay.tsx`:

```tsx
import { ModeToggle } from '@/components/filters/ModeToggle'

// ...
;<div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
  <ModeToggle />
</div>
```

Because both components call `useFilterContext()` through `ModeToggle`, they share the same underlying state. Selecting "Bicyclist" in the mobile overlay and then switching to desktop view shows "Bicyclist" already selected in the sidebar — they're the same context.

#### End-to-End Flow

Selecting a mode in the UI triggers this chain:

1. `ModeToggle` dispatches `SET_MODE` → `FilterContext` reducer updates `filterState.mode`
2. `toCrashFilter(filterState)` includes `{ mode: "Bicyclist" }` in the returned object
3. `CrashLayer` passes this to the `GET_CRASHES` query variables
4. Apollo re-executes the query; the resolver's `buildWhere()` adds `where: { mode: { equals: "Bicyclist" } }`
5. PostgreSQL returns only bicyclist crashes; the map re-renders with the filtered GeoJSON
6. `getActiveFilterLabels(filterState)` returns `["🚲"]`; `SummaryBar` renders it as a badge

### Step 2: Severity Filter

The severity filter lets users choose which injury outcomes to show on the map. Three buckets are checked by default (Death, Major Injury, Minor Injury). A fourth — No Injury / Unknown — is hidden by default and requires an explicit opt-in, since those crashes are far less likely to be of interest to users.

#### Severity State in FilterContext

The context models this with two separate fields:

```ts
export interface FilterState {
  severity: SeverityBucket[] // which buckets are active
  includeNoInjury: boolean // opt-in for the None bucket
}
```

The split matters because "none" has different default semantics than the other three. Keeping it as a separate boolean lets the reducer express it cleanly:

```ts
case 'SET_SEVERITY':
  return { ...filterState, severity: action.payload }
case 'TOGGLE_NO_INJURY':
  return { ...filterState, includeNoInjury: !filterState.includeNoInjury }
```

And `toCrashFilter()` merges them only when building the GraphQL input:

```ts
const effectiveSeverity = [
  ...filterState.severity,
  ...(filterState.includeNoInjury ? ['None'] : []),
]
```

#### Centralizing Crash Colors in `lib/crashColors.ts`

Before building the `SeverityFilter` component, we need to create a shared color palette file. Three components need to know severity colors — `CrashLayer` (for the Mapbox circle paint), `SeverityFilter` (for the legend dots), and `InfoPanelContent` (for the map key in the info panel). Defining the colors in one place ensures they always stay in sync.

Create `lib/crashColors.ts`:

```ts
import type { SeverityBucket } from '@/context/FilterContext'

type ColorMap = Record<SeverityBucket, string>

/**
 * Standard severity color palette.
 * Rendered bottom-to-top: None → Minor → Major → Death.
 */
export const STANDARD_COLORS: ColorMap = {
  None: '#C5E1A5',
  'Minor Injury': '#FDD835',
  'Major Injury': '#F57C00',
  Death: '#B71C1C',
}

/**
 * Accessible severity color palette — Paul Tol Muted scheme.
 * Distinguishable under all forms of color vision deficiency
 * (protanopia, deuteranopia, tritanopia).
 */
export const ACCESSIBLE_COLORS: ColorMap = {
  None: '#44AA99',
  'Minor Injury': '#DDCC77',
  'Major Injury': '#CC6677',
  Death: '#332288',
}
```

Two palettes: `STANDARD_COLORS` for the default view, and `ACCESSIBLE_COLORS` (Paul Tol Muted scheme) for when the user has enabled the accessible colors toggle. Exporting both from one file means that any component can import the pair and select based on `filterState.accessibleColors`.

#### Building SeverityFilter

Create `components/filters/SeverityFilter.tsx`. Each checkbox row includes a colored dot that matches the map circle for that severity bucket, giving users an immediate visual connection:

```tsx
'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { useFilterContext, type SeverityBucket } from '@/context/FilterContext'
import { STANDARD_COLORS, ACCESSIBLE_COLORS } from '@/lib/crashColors'

const BUCKETS: SeverityBucket[] = ['Death', 'Major Injury', 'Minor Injury']

export function SeverityFilter() {
  const { filterState, dispatch } = useFilterContext()
  const colors = filterState.accessibleColors ? ACCESSIBLE_COLORS : STANDARD_COLORS

  function toggleBucket(bucket: SeverityBucket, checked: boolean) {
    const next = checked
      ? [...filterState.severity, bucket]
      : filterState.severity.filter((b) => b !== bucket)
    dispatch({ type: 'SET_SEVERITY', payload: next })
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Severity</p>

      <div className="space-y-2">
        {BUCKETS.map((bucket) => (
          <div key={bucket} className="flex items-center gap-2">
            <Checkbox
              id={`severity-${bucket}`}
              checked={filterState.severity.includes(bucket)}
              onCheckedChange={(checked) => toggleBucket(bucket, checked === true)}
            />
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colors[bucket] }}
              aria-hidden="true"
            />
            <label htmlFor={`severity-${bucket}`} className="cursor-pointer text-sm leading-none">
              {bucket}
            </label>
          </div>
        ))}
      </div>

      <div className="border-t pt-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="severity-none"
            checked={filterState.includeNoInjury}
            onCheckedChange={() => dispatch({ type: 'TOGGLE_NO_INJURY' })}
          />
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: colors['None'] }}
            aria-hidden="true"
          />
          <label htmlFor="severity-none" className="cursor-pointer text-sm leading-none">
            No Injury / Unknown
          </label>
        </div>
      </div>
    </div>
  )
}
```

A few design decisions worth noting:

**Importing colors from `lib/crashColors.ts`.** Rather than hardcoding color values inline, `SeverityFilter` imports `STANDARD_COLORS` and `ACCESSIBLE_COLORS` from the shared palette file. The active palette is selected at render time based on `filterState.accessibleColors`. `CrashLayer` and `InfoPanelContent` import from the same file, so changing a color in one place updates all three.

**`checked === true` guard.** The Radix `Checkbox` `onCheckedChange` callback receives `boolean | 'indeterminate'`. The `=== true` comparison handles this cleanly without a cast or conditional branch.

**Toggling the array.** Because `SET_SEVERITY` replaces the whole array, the toggle logic builds the new array inline: spread-plus-bucket when checking, filter-out when unchecking. This keeps the reducer simple (no toggle-by-value case) at the cost of a tiny allocation per interaction.

**Divider before None.** The `border-t pt-2` wrapper around the None checkbox creates a visual separator between the three standard buckets and the opt-in category, reinforcing that it has different default behavior.

#### Wiring SeverityFilter to Both Surfaces

Drop `<SeverityFilter />` below `<ModeToggle />` in both surfaces. The `space-y-6` wrapper on both containers provides consistent spacing between sections:

```tsx
<div className="space-y-6 px-4 pb-4">
  <ModeToggle />
  <SeverityFilter />
</div>
```

---

### Step 3: Date Filter — Named Preset Buttons and Custom Range Picker

The date filter lets users narrow crashes by date in two ways: one-click named preset buttons (YTD, 90 Days, Last Year, 3 Years), or a custom start/end date via a calendar popover. Both modes write to the same `dateFilter` slot in `FilterContext`.

#### Why Named Presets Instead of Year Buttons?

An initial design used four buttons for the most recent calendar years (2024, 2023, ...). This was replaced with named, time-relative presets because:

- **Year buttons go stale.** A hardcoded "2024" button becomes misleading once the dataset has 2026 data.
- **Presets stay meaningful.** "YTD" always means "this year so far"; "Last Year" always means the previous full calendar year — no hardcoding, no maintenance.
- **Flexible anchoring.** Preset ranges are computed relative to `dataBounds.maxDate` (the most recent crash in the database), so they never extend beyond available data.

The four presets defined in `FilterContext`:

```ts
export type DatePreset = 'ytd' | '90d' | 'last-year' | '3y'

export const PRESET_LABELS: Record<DatePreset, string> = {
  ytd: 'YTD',
  '90d': '90 Days',
  'last-year': 'Last Year',
  '3y': '3 Years',
}
```

#### Loading Data Bounds

Before the preset buttons can show meaningful date ranges, `DateFilter` needs to know the actual min/max dates in the database. We reuse the existing `GET_FILTER_OPTIONS` query — but now we also select `minDate` and `maxDate` fields that were added to `FilterOptions` in Phase 2:

```ts
// lib/graphql/queries.ts — updated type
export type GetFilterOptionsQuery = {
  filterOptions: {
    states: string[]
    years: number[]
    minDate: string | null
    maxDate: string | null
  }
}

// Updated query document
export const GET_FILTER_OPTIONS = gql`
  query GetFilterOptions {
    filterOptions {
      states
      years
      minDate
      maxDate
    }
  }
`
```

`DateFilter` fires this query on mount and stores the result in context via `SET_DATE_BOUNDS`:

```tsx
const { data: boundsData } = useQuery<GetFilterOptionsQuery>(GET_FILTER_OPTIONS)

useEffect(() => {
  const { minDate, maxDate } = boundsData?.filterOptions ?? {}
  if (minDate && maxDate) {
    dispatch({ type: 'SET_DATE_BOUNDS', payload: { minDate, maxDate } })
  }
}, [boundsData, dispatch])
```

`dataBounds` in `FilterContext` is `null` until this resolves. `CrashLayer` skips the GraphQL query when `dateFilter.type === 'preset'` and `dataBounds === null` to avoid an unbounded initial query before we know the data range.

#### Preset Buttons with Toggle Behavior

The preset buttons use a `QUICK_PRESETS` array and dispatch `SET_DATE_PRESET`. Clicking an already-active preset toggles it off with `CLEAR_DATE`:

```tsx
const QUICK_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'ytd', label: 'YTD' },
  { id: '90d', label: '90d' },
  { id: 'last-year', label: 'Last Year' },
  { id: '3y', label: '3yrs' },
]

function handlePresetClick(preset: DatePreset) {
  if (selectedPreset === preset) {
    dispatch({ type: 'CLEAR_DATE' })
  } else {
    dispatch({ type: 'SET_DATE_PRESET', payload: preset })
  }
}
```

The active preset button uses `variant="default"`; inactive buttons use `variant="outline"`.

#### Calendar Popover with DayPicker v9 Quirk

For arbitrary date ranges we use the shadcn `Popover` with a `Calendar` inside. The calendar uses `mode="range"` and `captionLayout="dropdown"` for month/year navigation. We bind `month`/`onMonthChange` as controlled state so that opening the popover always lands on the start of the active range rather than jumping to today.

**DayPicker v9 quirk.** In react-day-picker v9, the first click sets both `from` and `to` to the same date (changed from v8, which left `to` undefined). Without a workaround, the second click would register as a range-end on the same date as the range-start. Fix: intercept in `onSelect` and treat `from === to` as a start-only selection:

```tsx
function handleRangeSelect(range: DateRange | undefined) {
  // DayPicker v9 sets from === to on the first click; treat that as start-only
  if (range?.from && range?.to && range.from.getTime() === range.to.getTime()) {
    setPendingRange({ from: range.from, to: undefined })
    return
  }
  setPendingRange(range)
  if (range?.from && range?.to) {
    const committed = doCommit(range.from, range.to)
    if (committed) {
      setPendingRange(undefined)
      setOpen(false)
    }
  }
}
```

`pendingRange` is local state that tracks the in-progress selection. It lets the calendar render the intermediate state (one end highlighted) while keeping context clean until both ends are chosen. When the popover closes without completing a range, `pendingRange` resets to `undefined`.

#### Validating Against Data Bounds

Before committing, `doCommit` runs `validateRange` which checks that the selected range falls within `dataBounds`. If not, it fires a `toast.error` and returns without dispatching:

```tsx
function validateRange(from: Date, to: Date): string | null {
  if (isBefore(to, from)) return 'Start date must be before end date'
  if (dataBounds) {
    const min = parseISO(dataBounds.minDate)
    const max = parseISO(dataBounds.maxDate)
    if (isBefore(from, min))
      return `Data starts ${format(min, DATE_DISPLAY_FORMAT)} — no earlier records available`
    if (isAfter(to, max))
      return `Data ends ${format(max, DATE_DISPLAY_FORMAT)} — no later records available`
  }
  return null
}

function doCommit(from: Date, to: Date): boolean {
  const error = validateRange(from, to)
  if (error) {
    toast.error(error)
    return false
  }
  dispatch({
    type: 'SET_DATE_RANGE',
    payload: {
      startDate: format(from, 'yyyy-MM-dd'),
      endDate: format(to, 'yyyy-MM-dd'),
    },
  })
  return true
}
```

#### Seeding the Calendar Month on Open

When the popover opens, we seed the controlled `month` state to the start of the active range. This prevents the calendar from jumping to today when the user has a range selected:

```tsx
function handleOpenChange(next: boolean) {
  if (next) {
    if (activePresetRange) {
      setMonth(parseISO(activePresetRange.startDate))
    } else if (selectedRange) {
      setMonth(parseISO(selectedRange.startDate))
    }
  }
  if (!next) setPendingRange(undefined)
  setOpen(next)
}
```

`activePresetRange` is computed by calling `presetToDateRange(selectedPreset, dataBounds)` when both are non-null. This resolves the stored preset identifier to a concrete date range for display purposes, without changing the stored state from `{ type: 'preset', preset: '...' }`.

#### Calendar Bounds

The calendar's navigable range is bounded by `dataBounds` using DayPicker v9's `startMonth`/`endMonth` props (note: not `fromYear`/`toYear` — those are v8 names):

```tsx
<Calendar
  mode="range"
  selected={calendarSelected}
  onSelect={handleRangeSelect}
  captionLayout="dropdown"
  month={month}
  onMonthChange={handleMonthChange}
  startMonth={dataBounds ? parseISO(dataBounds.minDate) : undefined}
  endMonth={dataBounds ? parseISO(dataBounds.maxDate) : undefined}
/>
```

#### Clear Button

A "Clear" button inside the popover appears when `canClear` is true (a range or preset is active, or a pending selection is in progress). It dispatches `CLEAR_DATE` and resets local state:

```tsx
function handleClear() {
  dispatch({ type: 'CLEAR_DATE' })
  setPendingRange(undefined)
}
```

#### Wiring DateFilter to Both Surfaces

Add `<DateFilter />` between `<ModeToggle />` and `<SeverityFilter />` in both `Sidebar` and `FilterOverlay`. The section heading is "Date" since it covers both preset and custom range modes.

---

### Step 4: Geographic Filter — County, City, and Map Controls

The last filter section combines location filters with map display controls. Since the dataset is Washington-only, there is no state selector — county and city both load all Washington options up front. The section also houses "Update search as map moves" and "Satellite view" toggles, which were built around the same time and fit naturally here.

#### Adding the County and City Query Documents

Add two query documents and their TypeScript result types to `lib/graphql/queries.ts`:

```ts
export type GetCountiesQuery = {
  filterOptions: {
    counties: string[]
  }
}

export type GetCitiesQuery = {
  filterOptions: {
    cities: string[]
  }
}

export const GET_COUNTIES = gql`
  query GetCounties($state: String) {
    filterOptions {
      counties(state: $state)
    }
  }
`

export const GET_CITIES = gql`
  query GetCities($state: String, $county: String) {
    filterOptions {
      cities(state: $state, county: $county)
    }
  }
`
```

The `FilterOptions` type in the GraphQL schema has field-level arguments:

```graphql
type FilterOptions {
  states: [String!]!
  counties(state: String): [String!]!
  cities(state: String, county: String): [String!]!
  years: [Int!]!
}
```

Both `GET_COUNTIES` and `GET_CITIES` are `filterOptions` queries — they just select different fields with different arguments. Apollo Client caches them separately by query name and variable hash.

#### The GeographicFilter Component

Create `components/filters/GeographicFilter.tsx`. Since all data is Washington-only, we hardcode `WASHINGTON = 'Washington'` and pass it to both queries unconditionally — no state selector, no skipping:

```tsx
'use client'

import { useQuery } from '@apollo/client/react'
import { Loader2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useFilterContext } from '@/context/FilterContext'
import {
  GET_COUNTIES,
  GET_CITIES,
  type GetCountiesQuery,
  type GetCitiesQuery,
} from '@/lib/graphql/queries'

const ALL = '__all__'
const WASHINGTON = 'Washington'

export function GeographicFilter() {
  const { filterState, dispatch } = useFilterContext()

  const { data: countiesData, loading: countiesLoading } = useQuery<GetCountiesQuery>(
    GET_COUNTIES,
    { variables: { state: WASHINGTON } }
  )

  const { data: citiesData, loading: citiesLoading } = useQuery<GetCitiesQuery>(GET_CITIES, {
    variables: { state: WASHINGTON },
  })

  const counties = countiesData?.filterOptions?.counties ?? []
  const cities = citiesData?.filterOptions?.cities ?? []
  const isDisabled = filterState.updateWithMovement

  // ...handlers...
}
```

A few design decisions worth noting:

**Sentinel value instead of empty string.** shadcn's `Select` passes the selected item's `value` string to `onValueChange`. We use `'__all__'` as a sentinel for "no selection" and map it to `null` when dispatching, rather than passing an empty string which has falsy issues.

**County and city are fully decoupled.** The original design had `SET_COUNTY` reset the city, but this was changed so users can independently select any county and any city without either resetting the other. The `FilterContext` reducer reflects this: `SET_COUNTY` only updates `county`, and `SET_CITY` only updates `city`. Both lists load all Washington options simultaneously.

**Both queries run always.** Unlike the original cascading design, neither query uses `skip`. Loading all counties and all cities for Washington on mount is fast (the lists are small) and makes the selects available immediately.

**Skeleton on initial load.** When both queries are still loading and have no data yet, the component renders `Skeleton` placeholders rather than empty selects. Once either query resolves, the real UI renders with a `Loader2` spinner in the heading while the other query is still in flight.

**Disabling selects when "Update with movement" is on.** When `filterState.updateWithMovement` is true, the query uses the viewport bounding box instead of geo text filters. In that mode, county/city selects are `disabled` to avoid confusing the user — the location is the map viewport, not the selected county or city.

#### Map Controls Section

Below the location selects, `GeographicFilter` renders a "Map Controls" section with `Switch` toggles for display modes. These dispatch to `FilterContext` but don't affect the GraphQL query directly — they change how the map renders or how the query's geographic scope is determined:

```tsx
<div className="space-y-2">
  <p className="text-sm font-medium">Map Controls</p>
  <div className="flex items-center gap-2">
    <Switch
      id="update-with-movement"
      checked={filterState.updateWithMovement}
      onCheckedChange={(checked) =>
        dispatch({ type: 'SET_UPDATE_WITH_MOVEMENT', payload: checked })
      }
    />
    <Label htmlFor="update-with-movement" className="text-sm cursor-pointer">
      Update search as map moves
    </Label>
  </div>
  <div className="flex items-center gap-2">
    <Switch
      id="satellite-view"
      checked={filterState.satellite}
      onCheckedChange={(checked) => dispatch({ type: 'SET_SATELLITE', payload: checked })}
    />
    <Label htmlFor="satellite-view" className="text-sm cursor-pointer">
      Satellite view
    </Label>
  </div>
</div>
```

When "Update search as map moves" is enabled, `CrashLayer` switches from text-based geo filters to a viewport bounding box (`bbox`) filter, recalculated on every `moveend` event. This allows users to pan freely and have results update in real time.

#### Wiring to Both Surfaces

Add `<GeographicFilter />` at the bottom of the filter list in both `Sidebar` and `FilterOverlay`:

```tsx
// In Sidebar.tsx and FilterOverlay.tsx
import { GeographicFilter } from '@/components/filters/GeographicFilter'

// Inside the filter list:
<ModeToggle />
<DateFilter />
<SeverityFilter />
<GeographicFilter />
```

Apollo Client deduplicates network requests — `GET_COUNTIES` and `GET_CITIES` are only sent once regardless of how many `GeographicFilter` instances are mounted (desktop sidebar and mobile overlay both mount it).

---

### Step 5: Connecting Filters to the GraphQL Query and Loading State

#### How the Wiring Already Works

At this point you might wonder: do we need to do anything special to make filter changes trigger a new network request? The answer is no — Apollo Client handles it automatically.

`CrashLayer` reads from `FilterContext` and passes the converted filter to `useQuery`:

```tsx
const DISPLAY_LIMIT = 40_000

const { filterState, dispatch } = useFilterContext()
const { data, loading } = useQuery<GetCrashesQuery>(GET_CRASHES, {
  variables: { filter: toCrashFilter(filterState), limit: DISPLAY_LIMIT },
})
```

Apollo Client performs a **deep equality comparison** on `variables` before each render. When `filterState` changes (a user picks a new year, county, severity, etc.), `toCrashFilter(filterState)` produces a different object, Apollo detects the change, and a new network request fires automatically. The old data stays visible on the map while the new request is in flight — no blank-flash.

The `totalCount` returned by the query feeds back into context via `SET_TOTAL_COUNT`, which `AppShell` reads to populate `SummaryBar`. All of this was already wired when `FilterContext` was first introduced. The only thing genuinely missing was **loading feedback** — the user had no way to know a refetch was happening.

#### Adding a Loading Indicator

When filter variables change, Apollo's default behavior (`notifyOnNetworkStatusChange: false`) is to silently re-execute the query and update `data` when it completes. The component doesn't re-render during the wait. This means the SummaryBar shows the old count right up until the new result arrives — fine for fast responses, but confusing on slow connections.

We fix this by opting into network status notifications:

```tsx
// CrashLayer.tsx
const { data, loading } = useQuery<GetCrashesQuery>(GET_CRASHES, {
  variables: { filter: toCrashFilter(filterState), limit: DISPLAY_LIMIT },
  notifyOnNetworkStatusChange: true, // re-render during refetch
})
```

With this flag, `loading` is `true` not just on the initial fetch but also while re-fetching after a variable change. Crucially, `data` is **not cleared** — it continues to hold the previous result, so the map keeps showing the old crash points while the new request is in flight.

We surface this state through context by adding `isLoading` alongside `totalCount`:

```ts
// FilterContext.tsx — additions

export interface FilterState {
  // ...existing fields...
  isLoading: boolean   // true while a filter-triggered refetch is in flight
}

export type FilterAction =
  // ...existing actions...
  | { type: 'SET_LOADING'; payload: boolean }

// In the reducer:
case 'SET_LOADING':
  return { ...filterState, isLoading: action.payload }

// In initialState:
isLoading: false,
```

Back in `CrashLayer`, two `useEffect` hooks manage the state:

```tsx
// Signal loading state to context
useEffect(() => {
  dispatch({ type: 'SET_LOADING', payload: loading })
}, [loading, dispatch])

// Only update the count when loading is done (keeps old count visible during refetch)
useEffect(() => {
  if (!loading) {
    dispatch({ type: 'SET_TOTAL_COUNT', payload: data?.crashes.totalCount ?? null })
  }
}, [data, loading, dispatch])
```

The second `useEffect` is a small but important detail: if we dispatched `SET_TOTAL_COUNT` unconditionally, the count would stay correct (Apollo keeps old `data` during refetch). But making it conditional on `!loading` is explicit and makes the intent clear.

Finally, `SummaryBar` accepts an `isLoading` prop and shows a `Loader2` spinner when a refetch is in flight. Note that crash count is **not** displayed in `SummaryBar` — it was moved to the filter panels (sidebar header and overlay header) so it stays visible while the filter controls are open:

```tsx
// SummaryBar.tsx
interface SummaryBarProps {
  activeFilters?: string[]
  isLoading?: boolean
  actions?: React.ReactNode
}

export function SummaryBar({ activeFilters = [], isLoading = false, actions }: SummaryBarProps) {
  return (
    <div className="...">
      {isLoading && <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />}

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeFilters.map((filter) => (
            <Badge key={filter} variant="secondary" className="text-xs">
              {filter}
            </Badge>
          ))}
        </div>
      )}

      {/* Actions (e.g. export button) — desktop only */}
      {actions && (
        <div className="hidden md:flex items-center gap-1 ml-auto">
          <div className="h-4 w-px bg-border" aria-hidden="true" />
          {actions}
        </div>
      )}
    </div>
  )
}
```

The `Loader2` spinner from Lucide React gives a clear, standard loading affordance. The `actions` slot is reserved for the CSV export button (added in Phase 5) and is hidden on mobile. `AppShell` passes `filterState.isLoading` and `getActiveFilterLabels(filterState)` as props to `SummaryBar`.

---

### Step 6: Debugging — Browser Extension Hydration Mismatches

#### The Problem

After the loading state was added, the browser console showed this warning:

> A tree hydrated but some attributes of the server rendered HTML didn't match the client properties.

The diff pointed at every Lucide icon SVG element:

```text
- data-darkreader-inline-stroke=""
- style={{--darkreader-inline-stroke:"currentColor"}}
```

The `-` lines are attributes present in the browser DOM that React's virtual DOM doesn't know about. These are injected by the **Dark Reader** browser extension, which modifies SVG `stroke` attributes on every `<svg>` element it finds — including Lucide icons.

The sequence of events:

1. Server renders the HTML (no Dark Reader attributes)
2. Browser receives the HTML and renders it
3. Dark Reader extension immediately mutates SVG elements, adding `data-darkreader-inline-stroke` and an inline CSS variable
4. React hydrates — its virtual DOM doesn't match the extension-modified DOM → warning

This is not a bug in the app's code. It would only appear for users with Dark Reader installed.

#### The Fix

`suppressHydrationWarning` tells React to skip attribute comparison on a specific element:

```tsx
// ThemeToggle.tsx
<Sun className="size-4 dark:hidden" suppressHydrationWarning />
<Moon className="size-4 hidden dark:block" suppressHydrationWarning />

// AppShell.tsx
<SlidersHorizontal className="size-4" suppressHydrationWarning />
```

Lucide React icon components forward all unknown props to the underlying `<svg>` element, so `suppressHydrationWarning` lands exactly where it needs to.

A few things to know about `suppressHydrationWarning`:

- It only applies **one level deep** — it suppresses mismatches on the element it's set on, not its children. Fortunately, Dark Reader targets the `<svg>` element itself (not its child `<path>` elements), so one level is sufficient.
- It does not affect rendering at all — it's a React-only hint that is stripped from the final DOM.
- It is the [React-recommended](https://react.dev/reference/react-dom/client/hydrateRoot#suppressing-unavoidable-hydration-mismatch-errors) escape hatch for third-party code that modifies the DOM before hydration.

Apply it to any Lucide icon (or other SVG-rendering component) that shows up in the hydration warning trace.

---

### Step 7: Auto-Zoom on Geographic Filter Change

#### Why Auto-Zoom?

Once geographic filters are wired to the query, users can select a state, county, or city and the crash data on the map updates — but the viewport doesn't move. The user has to manually pan and zoom to find their results, which defeats the purpose of a geographic filter. The map should follow the data.

#### Design Decisions

Before writing any code, it's worth being precise about **when** auto-zoom should fire:

- ✅ State, county, or city filter changes → zoom to fit crashes
- ❌ Severity, mode, or date changes → do **not** zoom; the user may have panned and their viewport should be respected
- ❌ Geographic filter cleared back to null → do **not** zoom; no target to zoom to

This means we can't simply react to `data` changing. Every filter change causes a refetch and a `data` update, but we only want to zoom for geographic ones.

#### The Two-Ref Pattern

The complication is that **geographic filter changes and data arrival happen at different React render cycles**:

1. User selects "Washington" → `filterState.state` changes → Apollo starts re-fetching (data still stale)
2. Apollo finishes → `data` updates with Washington crashes → `loading` flips to `false`

If we put both concerns in a single `useEffect`, we'd either zoom on stale data (bad) or miss the change entirely. The solution is to split them into two effects with a shared flag:

```tsx
// Two refs: one tracks previous geo values, one is a zoom-pending flag
const prevGeoRef = useRef<{ state: string | null; county: string | null; city: string | null }>({
  state: null,
  county: null,
  city: null,
})
const zoomPendingRef = useRef(false)

// Effect 1: fired when state/county/city changes — just sets the flag.
// Skip auto-zoom when updateWithMovement is on (map position is user-driven).
useEffect(() => {
  if (filterState.updateWithMovement) return
  const { state, county, city } = filterState
  const prev = prevGeoRef.current
  const changed = state !== prev.state || county !== prev.county || city !== prev.city
  if (!changed) return
  prevGeoRef.current = { state, county, city }
  zoomPendingRef.current = !!(state || county || city)
}, [filterState.state, filterState.county, filterState.city, filterState.updateWithMovement]) // eslint-disable-line react-hooks/exhaustive-deps

// Effect 2: fired when data arrives — executes zoom if flag is set.
// Uses displayData (not data) so it works correctly when previousData is in use.
useEffect(() => {
  if (loading || !zoomPendingRef.current || !map || !displayData?.crashes?.items?.length) return

  const points = displayData.crashes.items.filter((c) => c.latitude != null && c.longitude != null)
  if (points.length === 0) return

  zoomPendingRef.current = false

  if (points.length === 1) {
    map.flyTo({ center: [points[0].longitude!, points[0].latitude!], zoom: 13, duration: 800 })
    return
  }

  let minLng = Infinity,
    maxLng = -Infinity
  let minLat = Infinity,
    maxLat = -Infinity
  for (const crash of points) {
    minLng = Math.min(minLng, crash.longitude!)
    maxLng = Math.max(maxLng, crash.longitude!)
    minLat = Math.min(minLat, crash.latitude!)
    maxLat = Math.max(maxLat, crash.latitude!)
  }

  map.fitBounds(
    [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
    { padding: 80, duration: 800, maxZoom: 14 }
  )
}, [displayData, loading, map])
```

Effect 1's dependency array lists the three geo filter fields plus `filterState.updateWithMovement` individually so it only runs when those specific values change. The `eslint-disable` comment is needed because the rule sees `filterState` accessed inside the callback and expects the whole object in deps, but accessing the four subproperties inside the deps array is the correct pattern here.

Effect 2 uses `displayData` rather than `data` because `CrashLayer` uses `data ?? previousData` to keep the previous result visible while a refetch is in flight. Using raw `data` would cause Effect 2 to miss the zoom when the result comes from the cache. Effect 2 also uses `useRef` for `zoomPendingRef` rather than `useState` — we don't want setting the flag to trigger a re-render, we just want to store state across render cycles.

#### Where This Lives

Both effects go inside `CrashLayer.tsx`, which already has access to `useMap()` (for `map`) and `useFilterContext()` (for `filterState`). No prop drilling, no new context fields, no API changes.

```tsx
// CrashLayer.tsx — existing imports
import { useEffect, useRef } from 'react' // add useRef
import { useMap } from 'react-map-gl/mapbox' // already imported

export function CrashLayer() {
  const { current: map } = useMap() // already existed
  const { filterState, dispatch } = useFilterContext()

  // add refs here, then the two new effects after the existing ones
}
```

#### Calculating Bounds Client-Side vs. Server-Side

An alternative approach would be to add a `crashBounds(filter)` GraphQL query that returns `{ minLat, minLng, maxLat, maxLng }` computed by the database. The database's min/max aggregation would scale to millions of rows trivially.

We chose client-side bounds instead because:

- The crash data (up to 40,000 rows) is **already loaded** by the existing `GET_CRASHES` query
- Client-side min/max over 40,000 points is instantaneous
- No new API surface, no schema changes, no extra network round-trip

If the dataset grows beyond the display limit and the limit is raised accordingly, revisit this — the DB approach would then be more efficient.

#### Edge Cases

| Situation                             | Behavior                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| 0 crashes match the geo filter        | No zoom — the guard clause exits early before touching the map                               |
| 1 crash matches                       | `flyTo` at zoom 13 — `fitBounds` on a single point would zoom to `maxZoom` (too close)       |
| Many crashes spread across a state    | `fitBounds` with 80px padding, capped at zoom 14 to avoid zooming in too far on sparse areas |
| Geo filter cleared to null            | Effect 1 sets `zoomPendingRef = false` — Effect 2 exits immediately                          |
| User pans away, then changes severity | Effect 1 doesn't fire (no geo change) — Effect 2 exits (flag is false)                       |

---

### Step 8: Default Filter State

#### Starting With Focused Data

When a user first opens CrashMap, presenting no crashes at all (empty map, filters cleared) is a poor experience. The application has a specific dataset — Washington state bicyclist and pedestrian crash data — so defaulting to that context makes more sense than requiring the user to select filters before anything appears.

The simplest way to set startup filters is to update `initialState` in `FilterContext.tsx`:

```ts
const initialState: FilterState = {
  mode: null, // All modes
  severity: DEFAULT_SEVERITY, // Death, Major, Minor
  includeNoInjury: false,
  dateFilter: { type: 'preset', preset: '90d' }, // Last 90 days, anchored to dataBounds.maxDate
  state: 'Washington', // Dataset scope
  county: null,
  city: null,
  updateWithMovement: false,
  satellite: false,
  accessibleColors: false,
  totalCount: null,
  isLoading: false,
  dataBounds: null, // populated after GET_FILTER_OPTIONS resolves
}
```

Because `RESET` dispatches `return initialState`, resetting filters also returns to this focused view rather than a blank state. This is the right behavior — "reset" means "back to the default app view," not "clear everything."

The auto-zoom effect in `CrashLayer` also fires on initial load because `prevGeoRef` initializes to `{ state: null, ... }` while the initial filter state has `state: 'Washington'` — so Effect 1 sees a change, sets the pending flag, and Effect 2 zooms to Washington bounds once the first query resolves.

#### Always Showing the Active Mode in SummaryBar

The SummaryBar displays filter badges so users know what they're looking at. Originally, no badge appeared when mode was `null` (All modes) since "All" was treated as the non-active default. But once Washington became the default, the philosophy shifted: always show the active filter state, not just non-default selections.

The mode badge uses emojis rather than text — they're more compact in the summary bar and immediately recognizable:

```ts
// getActiveFilterLabels — mode badge (always shown)
if (filterState.mode === 'Bicyclist') {
  labels.push('🚲')
} else if (filterState.mode === 'Pedestrian') {
  labels.push('🚶🏽‍♀️')
} else {
  labels.push('🚲 🚶🏽‍♀️') // All modes
}
```

The SummaryBar always shows exactly one mode badge — either `🚲 🚶🏽‍♀️`, `🚲`, or `🚶🏽‍♀️` — making the current filter state unambiguous at a glance.

---

## Phase 5: Security, Polish & Deployment

### Step 1: Rate Limiting the GraphQL API

CrashMap's `/api/graphql` endpoint is public and unauthenticated. Without rate limiting, a single bad actor could hammer the endpoint and exhaust the database connection pool or inflate Render compute usage. The fix is a simple per-IP request cap applied before Apollo Server ever sees the request.

#### Why not `middleware.ts`?

Next.js has a `middleware.ts` file that intercepts requests before they reach route handlers — the natural home for cross-cutting concerns like rate limiting. However, Next.js compiles `middleware.ts` against the **Edge Runtime** API surface, even when deploying to a standalone Node.js server like Render. The Edge Runtime does not guarantee that module-level variables (like a `Map`) persist across requests. Using a module-level `Map` in middleware risks silent data loss — the store could be re-initialized on any request.

The route handler (`app/api/graphql/route.ts`) runs in the **Node.js runtime** on Render's long-lived server process. Module-level variables in a route handler module are loaded once and persist for the lifetime of the server process — the same guarantee that makes the Prisma singleton pattern reliable. This is where the rate limit store should live.

#### The algorithm: sliding window log

The sliding window log algorithm is the right choice for this scale:

- Track a list of timestamps (one per request) per IP address
- On each new request, discard timestamps older than the window (60 seconds), then check if the remaining count is at or above the limit
- If yes → reject with 429; if no → record the new timestamp and allow through

Unlike a fixed-window counter (which can allow 2× the limit across a window boundary), the sliding window is accurate. And unlike a token bucket, it needs no background "refill" process — the pruning happens inline.

#### Implementation

Create `lib/rate-limit.ts`:

```ts
import { NextRequest } from 'next/server'

const WINDOW_MS = 60_000
const MAX_REQUESTS = 60

const store = new Map<string, number[]>()

// Periodic sweep: evict IPs with no activity in the last window
setInterval(
  () => {
    const cutoff = Date.now() - WINDOW_MS
    for (const [ip, timestamps] of store) {
      const fresh = timestamps.filter((t) => t >= cutoff)
      if (fresh.length === 0) store.delete(ip)
      else store.set(ip, fresh)
    }
  },
  5 * 60 * 1000
)

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return '127.0.0.1'
}

export function checkRateLimit(ip: string): Response | null {
  const now = Date.now()
  const cutoff = now - WINDOW_MS
  const timestamps = (store.get(ip) ?? []).filter((t) => t >= cutoff)

  if (timestamps.length >= MAX_REQUESTS) {
    const retryAfter = Math.ceil((timestamps[0] + WINDOW_MS - now) / 1000)
    return new Response(
      JSON.stringify({
        errors: [
          {
            message: 'Too many requests. Please slow down.',
            extensions: { code: 'RATE_LIMITED' },
          },
        ],
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfter),
        },
      }
    )
  }

  timestamps.push(now)
  store.set(ip, timestamps)
  return null
}
```

A few details worth explaining:

**`getClientIp`** reads `x-forwarded-for` rather than a hypothetical `request.ip`. On Render, all traffic passes through a reverse proxy that appends the real client IP to `x-forwarded-for` as the leftmost value in a comma-separated list. In local development, no proxy is present, so `x-forwarded-for` is absent and the function returns the loopback address `127.0.0.1` — all local requests share one "IP," which is fine.

**Memory management** has two layers. Inline pruning (the `.filter()` call) handles active IPs: every request from an IP cleans that IP's own stale timestamps before the check. The `setInterval` sweep handles abandoned IPs: after an attacker stops sending requests, their entry would linger in the `Map` forever without the sweep. The sweep runs every 5 minutes and removes any IP whose entire timestamp array has expired. At 60 timestamps per IP and 8 bytes per number, even 10,000 concurrent abusive IPs would occupy only ~5 MB — well within Render's limits.

**The 429 response body** uses the GraphQL `errors` array format so Apollo Client can parse it without crashing. The `RATE_LIMITED` extension code follows the Apollo error spec and gives client-side code a stable string to check if they want to show a specific message.

#### Wire it into the route handler

In `app/api/graphql/route.ts`, import the helpers and add a check before each handler delegation:

```ts
import { getClientIp, checkRateLimit } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const limited = checkRateLimit(getClientIp(request))
  if (limited) return limited
  return handler(request)
}

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(getClientIp(request))
  if (limited) return limited
  return handler(request)
}
```

The Apollo Server setup (`depthLimitRule`, `server`, `handler`) is completely untouched. Existing Vitest tests call `server.executeOperation()` directly and bypass the HTTP layer, so they continue to pass with no changes.

#### Testing

Fire 61 rapid POST requests against the endpoint:

```bash
for i in $(seq 1 65); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST https://crashmap.onrender.com/api/graphql \
    -H 'Content-Type: application/json' \
    -d '{"query":"{ filterOptions { modes } }"}')
  echo "Request $i: $STATUS"
done
```

The first 60 return `200`. Request 61 onward returns `429` with a `Retry-After` header. After waiting 60 seconds, requests return `200` again.

---

### Step 2: Security Headers and CORS

With rate limiting in place, the next layer of protection is HTTP security headers and CORS. These don't stop determined attackers making direct HTTP requests, but they do close off whole classes of browser-based vulnerabilities: clickjacking, MIME sniffing, cross-origin data theft, and injection via third-party scripts.

#### Understand what the app touches

Before writing a Content Security Policy you need to inventory every external origin the browser connects to. For CrashMap:

| What                                | Origin(s)                                                   |
| ----------------------------------- | ----------------------------------------------------------- |
| Mapbox tile API                     | `https://*.mapbox.com`                                      |
| Mapbox telemetry/events             | `https://events.mapbox.com`                                 |
| Mapbox GL Web Worker                | `blob:` (mapbox-gl spawns its worker via a blob URL)        |
| Mapbox tile sprites/images          | `https://*.mapbox.com`, also `blob:`                        |
| Geist font (via `next/font/google`) | `'self'` — next/font downloads at build time and self-hosts |
| Next.js hydration scripts           | `'self'` + `'unsafe-inline'` (inline script tags)           |
| Tailwind / Mapbox inline styles     | `'unsafe-inline'`                                           |
| Next.js HMR (dev only)              | `'unsafe-eval'` (eval-based hot reloading)                  |

#### Add security headers in `next.config.ts`

Next.js exposes an async `headers()` function in `next.config.ts` that applies HTTP response headers to matched routes. This runs server-side at request time, so the browser receives these headers on every page load and API response.

```ts
import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'

const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.mapbox.com",
  "connect-src 'self' https://*.mapbox.com https://events.mapbox.com",
  'worker-src blob:',
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const nextConfig: NextConfig = {
  // ... existing config ...
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: cspDirectives },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}
```

**Why each directive:**

- **`default-src 'self'`** — baseline; everything not explicitly listed falls back to same-origin only.
- **`script-src 'unsafe-inline'`** — Next.js embeds inline `<script>` tags for React hydration. A nonce-based CSP is possible with Next.js middleware but significantly more complex; `'unsafe-inline'` is the pragmatic choice here.
- **`script-src 'unsafe-eval'` (dev only)** — Next.js HMR uses `eval()` for fast module reloading. We detect `NODE_ENV === 'development'` in `next.config.ts` at startup so the production build never gets this directive.
- **`style-src 'unsafe-inline'`** — Mapbox GL and Tailwind both inject inline styles. No way around this without nonces on every style element.
- **`img-src blob: https://*.mapbox.com`** — Mapbox loads tile images and sprites from its CDN. `blob:` covers canvas snapshot operations.
- **`connect-src https://*.mapbox.com https://events.mapbox.com`** — all Mapbox API requests (tiles, geocoding, telemetry). The wildcard subdomain covers `api.mapbox.com`, `events.mapbox.com` is separate. When Sentry error tracking is added later, you will also need `https://*.ingest.sentry.io https://*.ingest.us.sentry.io` here.
- **`worker-src blob:`** — Mapbox GL spawns its WebWorker from a blob URL. Without this the map silently fails to render in browsers that enforce CSP for workers.
- **`font-src 'self'`** — `next/font/google` downloads Geist at build time and serves it from `_next/static/`. The browser never fetches from `fonts.googleapis.com`.
- **`object-src 'none'`** — disables Flash and other plugins (belt-and-suspenders; they're gone from modern browsers anyway).
- **`frame-ancestors 'none'`** — prevents the app from being embedded in an `<iframe>` on another site (clickjacking protection). `X-Frame-Options: DENY` repeats this for older browsers that don't support CSP level 2.
- **`base-uri 'self'`** — prevents injected `<base>` tags from redirecting all relative URLs to an attacker-controlled domain.
- **`form-action 'self'`** — restricts where `<form>` submissions can be sent.

**The other headers:**

- **`X-Content-Type-Options: nosniff`** — tells the browser not to guess content types. Without it, a browser might execute a response as JavaScript even if the server sends `Content-Type: text/plain`.
- **`Referrer-Policy: strict-origin-when-cross-origin`** — sends the full URL as the `Referer` header for same-origin requests (useful for analytics) but only the origin for cross-origin ones (avoids leaking path/query params to third parties).
- **`Permissions-Policy`** — opts out of browser APIs the app doesn't use. CrashMap doesn't need camera, microphone, or geolocation access.

#### Add CORS to the GraphQL route

CORS headers tell browsers whether cross-origin JavaScript on _other_ websites is allowed to read responses from our API. Since CrashMap's data is public and there's no authentication, this doesn't prevent direct scraping — someone can always make `curl` requests. What it does prevent is other websites embedding our API and silently consuming our rate limit on behalf of their users' browsers.

The pattern for adding CORS to a Next.js route handler while preserving the response from a third-party handler (Apollo Server in our case) is to clone the response with new headers:

```ts
const ALLOWED_ORIGINS = new Set([
  'https://crashmap.io',
  'https://crashmap.onrender.com',
  'http://localhost:3000',
])

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

function getCorsOrigin(request: NextRequest): string {
  const origin = request.headers.get('origin')
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://crashmap.io'
}

async function withCors(response: Response, request: NextRequest): Promise<NextResponse> {
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', getCorsOrigin(request))
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value)
  }
  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
```

The key technique is `new Headers(response.headers)` — this copies all existing headers from the Apollo response into a fresh, mutable `Headers` instance. We can then add CORS headers on top without risk of mutating a potentially-frozen object. The body, status, and status text pass through unchanged.

We also need an `OPTIONS` handler for the browser's CORS preflight. Browsers send a `OPTIONS` request before any cross-origin `POST` to ask if the actual request is allowed. Without it, cross-origin GraphQL mutations (if we ever add them) would silently fail.

```ts
export async function OPTIONS(request: NextRequest) {
  return withCors(new Response(null, { status: 204 }), request)
}

export async function GET(request: NextRequest) {
  const limited = checkRateLimit(getClientIp(request))
  if (limited) return limited
  return withCors(await handler(request), request)
}

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(getClientIp(request))
  if (limited) return limited
  return withCors(await handler(request), request)
}
```

Note that `Access-Control-Allow-Origin` must be a single origin value (not a list) when `Access-Control-Allow-Credentials` is involved. Since we don't use credentials, we could use `*` — but reflecting the requesting origin from an allowlist gives us more control.

#### Verify

Run `npm run build` to confirm TypeScript and the build both pass. Then start the dev server and open the browser DevTools Network tab — every HTML and API response should now carry the security headers. You can verify CSP enforcement by temporarily adding an inline script that tries to call `eval()` and observing the console error.

For CORS, use `curl` with an `Origin` header:

```bash
curl -s -I -X OPTIONS https://crashmap.onrender.com/api/graphql \
  -H 'Origin: https://crashmap.io' \
  -H 'Access-Control-Request-Method: POST'
```

The response should include `Access-Control-Allow-Origin: https://crashmap.io` and `Access-Control-Allow-Methods: GET, POST, OPTIONS`.

---

### Step 3: Loading States

When users change a filter, the app fires a new GraphQL query and the map silently waits for fresh data. That gap — between action and response — is where loading states live. Without them the UI feels frozen or unresponsive.

CrashMap already had the infrastructure for loading states: `FilterContext` holds an `isLoading` boolean (dispatched by `CrashLayer` whenever the Apollo query's `loading` flag changes), and `SummaryBar` already accepted an `isLoading` prop with an `animate-pulse` class on the crash count. We extended this foundation with three focused changes.

#### Filter Button Spinner

The filter button in the top-right corner is the most contextually appropriate place for a loading indicator — it's right where the user just interacted. We import `Loader2` from `lucide-react` alongside the existing `SlidersHorizontal` and conditionally swap the icon:

```tsx
{
  filterState.isLoading ? (
    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
  ) : (
    <SlidersHorizontal className="size-4" suppressHydrationWarning />
  )
}
```

This applies to both the desktop sidebar button and the mobile overlay button. The button itself stays clickable during loading — no `disabled` state — so users can still open the filter panel while a fetch runs.

#### SummaryBar Spinner

The SummaryBar at the bottom of the screen shows the crash count. We add an explicit spinner icon to the left of the count while loading, alongside the existing pulse:

```tsx
<span className="flex items-center gap-1.5 text-sm font-medium tabular-nums whitespace-nowrap">
  {isLoading && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
  <span className={isLoading ? 'animate-pulse' : ''}>{countLabel} crashes</span>
</span>
```

The `aria-hidden="true"` on the spinner keeps screen readers from announcing "spinning" repeatedly; the `aria-live="polite"` on the SummaryBar container already handles announcing the count update when it arrives.

#### Geographic Dropdown Spinner

The cascading county/city dropdowns fire their own Apollo queries when a parent selection changes. The dropdowns were already disabled during loading (since the data arrays are empty until the query resolves), but there was no visual cue explaining _why_. We capture the `loading` flag from each query and display a small spinner next to the "Location" label:

```tsx
const { data: countiesData, loading: countiesLoading } = useQuery<GetCountiesQuery>(GET_COUNTIES, {
  variables: { state: filterState.state },
  skip: !filterState.state,
})

const { data: citiesData, loading: citiesLoading } = useQuery<GetCitiesQuery>(GET_CITIES, {
  variables: { state: filterState.state, county: filterState.county },
  skip: !filterState.county,
})
```

```tsx
<div className="flex items-center gap-1.5">
  <p className="text-sm font-medium">Location</p>
  {(countiesLoading || citiesLoading) && (
    <Loader2 className="size-3 animate-spin text-muted-foreground" aria-label="Loading" />
  )}
</div>
```

The spinner is muted (`text-muted-foreground`) so it doesn't compete with the filter labels; `aria-label="Loading"` gives screen readers a description since there's no visible text.

#### Design Principles

A few principles guided the choices here:

- **Contextual placement** — Loading indicators live closest to what triggered them. The filter button spins because the user just clicked it. The location label spins because the dropdowns are loading.
- **Non-blocking** — Nothing is disabled globally. Users can still open filters, scroll the map, or click while a fetch runs.
- **Preserve existing state** — `SET_TOTAL_COUNT` only dispatches when `loading` is false, so the previous crash count stays visible in the SummaryBar rather than flashing back to `—` during a refetch. The map likewise keeps the previous crash circles visible while new data loads.
- **Minimal noise** — Three small additions (spinner on button, spinner in bar, spinner by label) cover all the meaningful interaction points without cluttering the UI.

---

### Step 4: Error Boundaries

React renders component trees synchronously. When a component throws during render, React's default behavior is to unmount the entire tree — the user sees a blank page. **Error boundaries** intercept those throws and render a fallback UI instead.

React only supports class-based error boundaries (hooks can't implement `getDerivedStateFromError`). We create one generic, reusable component and apply it in two places.

#### The `ErrorBoundary` component

```tsx
// components/ErrorBoundary.tsx
'use client'

import { Component, ReactNode } from 'react'

type Props = {
  fallback: ReactNode
  children: ReactNode
}

type State = {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error)
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}
```

`getDerivedStateFromError` runs during the render phase and flips `hasError`. `componentDidCatch` runs in the commit phase and is the right place to log errors. Both are needed: the static method updates state, the instance method handles side effects.

#### Next.js route-level boundary (`app/error.tsx`)

Next.js App Router uses file-based error boundaries via `error.tsx`. Place this file in `app/` to catch any error thrown by a page or layout segment:

```tsx
// app/error.tsx
'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex h-dvh w-full items-center justify-center bg-background">
      <div className="space-y-3 text-center">
        <p className="text-sm text-muted-foreground">Something went wrong.</p>
        <Button variant="outline" size="sm" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  )
}
```

`reset()` re-renders the route segment from scratch. `h-dvh` fills the viewport since our page is full-screen.

#### Applying boundaries in `AppShell`

Two boundaries with different failure strategies:

**Map boundary** — if Mapbox throws during initialization, show a user-visible fallback with a refresh button:

```tsx
const mapFallback = (
  <div className="flex h-full w-full items-center justify-center bg-background">
    <div className="space-y-3 text-center">
      <p className="text-sm text-muted-foreground">Map failed to load.</p>
      <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
        Refresh
      </Button>
    </div>
  </div>
)

// In AppShell JSX:
<ErrorBoundary fallback={mapFallback}>
  <MapContainer ref={mapRef} />
</ErrorBoundary>
```

**Filter boundary** — if the sidebar or overlay crashes, silently suppress and keep the map working. Losing filters is a degraded but acceptable state; losing the map is not:

```tsx
<ErrorBoundary fallback={null}>
  <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
  <FilterOverlay isOpen={overlayOpen} onClose={() => setOverlayOpen(false)} />
</ErrorBoundary>
```

#### Design rationale

- **Granularity over breadth** — A single root boundary would protect the whole page, but it would also take down the map if filters crash. Separate boundaries let independent subtrees fail independently.
- **`fallback={null}` is a valid strategy** — For the filters, a blank panel with a working map is better than a broken-looking fallback UI. The `ErrorBoundary` still catches and logs the error; it just doesn't show anything.
- **`window.location.reload()` for the map** — The map error is catastrophic enough that a full reload (which re-initializes Mapbox's WebGL context) is the right recovery path. For filters, there's nothing to recover to, so we suppress.

---

### Step 5: Skeleton Screens

Spinners communicate "something is happening." Skeletons communicate "something will appear _here_, in approximately this shape." For CrashMap there are two places where users see a blank or placeholder state on initial load:

1. The crash count in `SummaryBar` shows a `—` dash until the first GraphQL query resolves.
2. The geographic filter dropdowns render as disabled, empty `<Select>` elements until the `filterOptions` query returns state/county/city data.

Both are good candidates for skeleton screens.

#### Install the shadcn Skeleton component

shadcn provides a simple `Skeleton` component out of the box:

```bash
npx shadcn@latest add skeleton
```

This creates `components/ui/skeleton.tsx`:

```tsx
import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('bg-accent animate-pulse rounded-md', className)}
      {...props}
    />
  )
}

export { Skeleton }
```

It's just a `div` with `bg-accent animate-pulse rounded-md`. The `bg-accent` color sits between your background and foreground, giving a neutral shimmer that works in both light and dark mode without any extra configuration. Size it with `h-*` and `w-*` utility classes to match the element it's replacing.

#### Skeleton for the geographic filter

`GeographicFilter` makes a `GET_FILTER_OPTIONS` query on mount to populate the State dropdown. During that initial fetch the three `<Select>` dropdowns exist in the DOM but are empty and disabled — an awkward "not ready yet" state. A skeleton is a cleaner signal.

The original query didn't even track the loading flag:

```tsx
const { data: optionsData } = useQuery<GetFilterOptionsQuery>(GET_FILTER_OPTIONS)
```

Add `loading: optionsLoading` and use it to return an early skeleton:

```tsx
const { data: optionsData, loading: optionsLoading } =
  useQuery<GetFilterOptionsQuery>(GET_FILTER_OPTIONS)

// ...

if (optionsLoading) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Location</p>
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  )
}
```

`h-9` matches shadcn's default `<SelectTrigger>` height, so the skeleton has the same footprint as the dropdowns it's replacing. Three stacked skeletons map to State, County, and City. Once `optionsLoading` flips to false, the component renders the real dropdowns as before.

#### Skeleton for the crash count

`SummaryBar` receives a `crashCount` prop that starts as `null` and transitions to a number once the first crash query resolves. The existing code renders a `—` dash for `null`:

```tsx
const countLabel = crashCount === null ? '—' : crashCount.toLocaleString()
```

Replace the dash with an inline skeleton:

```tsx
{
  crashCount === null ? (
    <>
      <Skeleton className="inline-block h-4 w-10 align-middle" /> crashes
    </>
  ) : (
    <span className={isLoading ? 'animate-pulse' : ''}>{countLabel} crashes</span>
  )
}
```

`inline-block` is needed because `Skeleton` is a `div` (block by default) but sits inside a `<span>`. `align-middle` keeps it vertically centered with the surrounding text. `w-10` (40px) is wide enough to suggest a 3–4 digit number without implying an exact value.

The existing `Loader2` spinner and `animate-pulse` on the count text handle subsequent filter-triggered refetches, where there _is_ already a count to show — the skeleton only covers the cold-start case.

#### Why separate the two loading patterns

| Pattern         | When to use                                                                       |
| --------------- | --------------------------------------------------------------------------------- |
| Skeleton        | Initial load — no content exists yet; user doesn't know what shape the data takes |
| Spinner + pulse | Refetch — content exists; user knows what it looks like; just indicate "updating" |

Using skeletons for refetches would cause the content to disappear and reappear on every filter change, which is jarring. The existing `notifyOnNetworkStatusChange: true` + previous-data-preservation approach is already correct for that case.

---

### Step 6: Shareable Filter URLs

One of the most useful features for a data visualization app is the ability to share a specific view via URL. Right now, all filter state lives in React Context — navigating to the same URL always shows the default filters. We want `?severity=Death&mode=Pedestrian&state=Ohio&county=Franklin` to restore that exact configuration on load.

#### The Core Challenge

Filter state is managed by a `useReducer` in `FilterContext`. The URL is managed by the browser and Next.js's App Router. These two systems need to be kept in sync bidirectionally:

1. **URL → State** (on page load / navigation): parse URL params, hydrate context
2. **State → URL** (on filter interaction): encode context, update URL

The tricky part is doing this without causing an infinite feedback loop between the two directions, and without overwriting an incoming shared URL on the first render.

#### Define the URL parameter schema

Before writing any code, decide what the URL should look like. The key principle: **omit default values**. A clean URL (`/`) means the default view. Params only appear when the user has changed something.

Our URL schema:

| Filter       | Default (omitted)                         | URL when non-default                                                                 |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| Mode         | `null` (all)                              | `?mode=Bicyclist`                                                                    |
| Severity     | `['Death','Major Injury','Minor Injury']` | `?severity=Death,Minor+Injury`                                                       |
| Include None | `false`                                   | `None` appended to severity CSV                                                      |
| Date         | preset (YTD, omitted from URL)            | `?date=90d`, `?date=last-year`, `?date=3y`, `?date=none`, `?dateFrom=...&dateTo=...` |
| State        | `'Washington'`                            | `?state=Ohio` or `?state=none` (all states)                                          |
| County       | `null`                                    | `?county=Franklin`                                                                   |
| City         | `null`                                    | `?city=Columbus`                                                                     |

A few design decisions worth noting:

- **Severity uses CSV** — `?severity=Death,Major+Injury,Minor+Injury` — because it's the only multi-value field. The `None` bucket is embedded in the same CSV (rather than a separate `?noInjury=1` param) since the two are always displayed together in the UI.
- **`?state=none`** — we need a sentinel value for "all states" (null) because the default is _Washington_ (non-null). Without an explicit sentinel, absent `?state` is ambiguous: does it mean "Washington" or "all states"? The sentinel resolves this: absent = Washington, `?state=none` = all states.
- **`?date=none`** — same problem for the date filter. Absent = the default preset (YTD), `?date=none` = no date filter. Named presets use explicit values (`?date=90d`, `?date=last-year`, `?date=3y`); only `ytd` is omitted. The date filter was later overhauled to use named presets — see the Date Filter sections below.

#### Create pure encode/decode utilities

Create `lib/filterUrlState.ts` with two pure functions — no React, no side effects, fully unit-testable:

```typescript
// lib/filterUrlState.ts
import type { DateFilter, FilterState, ModeFilter, SeverityBucket } from '@/context/FilterContext'
import { DEFAULT_SEVERITY } from '@/context/FilterContext'

const DEFAULT_STATE = 'Washington'
const DEFAULT_YEAR = 2025

export function encodeFilterParams(filterState: FilterState): URLSearchParams {
  const params = new URLSearchParams()

  if (filterState.mode !== null) {
    params.set('mode', filterState.mode)
  }

  const isDefault =
    !filterState.includeNoInjury &&
    filterState.severity.length === DEFAULT_SEVERITY.length &&
    DEFAULT_SEVERITY.every((b) => filterState.severity.includes(b))

  if (!isDefault) {
    const buckets = [...filterState.severity, ...(filterState.includeNoInjury ? ['None'] : [])]
    params.set('severity', buckets.join(','))
  }

  const { dateFilter } = filterState
  if (dateFilter.type === 'none') {
    params.set('date', 'none')
  } else if (dateFilter.type === 'year' && dateFilter.year !== DEFAULT_YEAR) {
    params.set('year', String(dateFilter.year))
  } else if (dateFilter.type === 'range') {
    params.set('dateFrom', dateFilter.startDate)
    params.set('dateTo', dateFilter.endDate)
  }

  if (filterState.state !== DEFAULT_STATE) {
    params.set('state', filterState.state === null ? 'none' : filterState.state)
  }
  if (filterState.county !== null) params.set('county', filterState.county)
  if (filterState.city !== null) params.set('city', filterState.city)

  return params
}
```

The decode function is the mirror image, with defensive fallbacks for any invalid or absent param:

```typescript
export function decodeFilterParams(params: URLSearchParams): UrlFilterState {
  // mode: fall back to null if absent or invalid
  const rawMode = params.get('mode')
  const mode: ModeFilter = rawMode === 'Bicyclist' || rawMode === 'Pedestrian' ? rawMode : null

  // severity: split CSV, extract 'None' as includeNoInjury flag
  let severity = [...DEFAULT_SEVERITY]
  let includeNoInjury = false
  const rawSeverity = params.get('severity')
  if (rawSeverity !== null) {
    const parsed = rawSeverity
      .split(',')
      .map((s) => s.trim())
      .filter((s) => ['Death', 'Major Injury', 'Minor Injury', 'None'].includes(s))
    if (parsed.length > 0) {
      includeNoInjury = parsed.includes('None')
      severity = parsed.filter((s) => s !== 'None') as SeverityBucket[]
    }
  }

  // state: absent → Washington; 'none' → null
  let state: string | null = DEFAULT_STATE
  if (params.has('state')) {
    const raw = params.get('state')!
    state = raw === 'none' ? null : raw
  }

  // county/city: guard orphan params (county without state, city without county)
  const county = params.get('county') !== null && state !== null ? params.get('county') : null
  const city = params.get('city') !== null && county !== null ? params.get('city') : null

  // ... (dateFilter decoding omitted for brevity)
  return { mode, severity, includeNoInjury, dateFilter, state, county, city }
}
```

Notice the **orphan param guard** for county/city: if someone manually types `?city=Seattle` without `?county=King+County`, we silently ignore the orphaned city. This prevents invalid partial states from hydrating into the reducer.

#### Add INIT_FROM_URL to the reducer

The filter reducer needs a new action that atomically sets all URL-derived values in one shot. This is important because we can't use existing actions like `SET_STATE` — that action cascades and clears county/city, which would break URL hydration if we dispatched `SET_STATE` before `SET_COUNTY`.

```typescript
// context/FilterContext.tsx

export type UrlFilterState = {
  mode: ModeFilter
  severity: SeverityBucket[]
  includeNoInjury: boolean
  dateFilter: DateFilter
  state: string | null
  county: string | null
  city: string | null
}

// Add to FilterAction union:
| { type: 'INIT_FROM_URL'; payload: UrlFilterState }

// Add to reducer:
case 'INIT_FROM_URL':
  return {
    ...filterState,
    mode: action.payload.mode,
    severity: action.payload.severity,
    includeNoInjury: action.payload.includeNoInjury,
    dateFilter: action.payload.dateFilter,
    state: action.payload.state,
    county: action.payload.county,
    city: action.payload.city,
    // totalCount and isLoading are derived — never set from URL
  }
```

The `INIT_FROM_URL` case writes all URL-derived fields at once, without cascading. The URL is the authoritative source here; we trust it to contain a consistent set of geo values (or not, in which case the UI degrades gracefully — showing no county results for a mismatched state).

#### Create the sync bridge component

The sync logic lives in a dedicated `FilterUrlSync` component that renders `null` — it exists purely for its side effects. This separation keeps the `FilterContext` clean (no routing hooks) and lets us control the `<Suspense>` boundary precisely.

```typescript
// components/FilterUrlSync.tsx
'use client'

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useFilterContext } from '@/context/FilterContext'
import { decodeFilterParams, encodeFilterParams } from '@/lib/filterUrlState'

export function FilterUrlSync() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { filterState, dispatch } = useFilterContext()

  // Skips Effect 2 on the first render (fires against initialState before
  // INIT_FROM_URL has been processed by the reducer).
  const skipFirstSyncRef = useRef(true)

  // Effect 1: URL → state (mount only)
  useEffect(() => {
    dispatch({ type: 'INIT_FROM_URL', payload: decodeFilterParams(searchParams) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Effect 2: state → URL (after every filterState change)
  useEffect(() => {
    if (skipFirstSyncRef.current) {
      skipFirstSyncRef.current = false
      return
    }
    const params = encodeFilterParams(filterState)
    const search = params.toString()
    router.replace(search ? `?${search}` : '/', { scroll: false })
  }, [filterState, router])

  return null
}
```

**The `skipFirstSyncRef` pattern** is the key correctness mechanism:

- On mount, React runs Effect 1 and Effect 2 in order (same commit, Effect 1 first).
- Effect 1 dispatches `INIT_FROM_URL`. The dispatch is queued — the reducer hasn't processed it yet.
- Effect 2 fires next. `skipFirstSyncRef.current` is `true` → skips the URL write, sets the ref to `false`.
- On the next render (after the dispatch processes), `filterState` now reflects the URL values.
- Effect 2 fires again. `skipFirstSyncRef.current` is `false` → encodes the new `filterState` → writes to URL. Since the state was just decoded from the URL, encoding it back produces the same params → no visible change.

Without this guard, Effect 2 on the first render would encode `initialState` (Washington, 2025, etc.) and call `router.replace`, overwriting the incoming shared URL before the hydration dispatch takes effect.

**Why `router.replace` instead of `router.push`?** `router.push` adds a history entry for every filter interaction. After clicking five filters, the user would need to press Back five times to leave the page. `router.replace` swaps the current history entry silently — the URL is shareable but navigation still feels natural.

#### Wire it into the layout

`useSearchParams()` in the Next.js App Router requires a `<Suspense>` boundary. Without one, Next.js throws a build error in production. The `FilterUrlSync` component must be both inside `FilterProvider` (to access context) and wrapped in `Suspense` (for the hook):

```tsx
// app/layout.tsx
import { Suspense } from 'react'
import { FilterUrlSync } from '@/components/FilterUrlSync'

// Inside RootLayout:
;<FilterProvider>
  <Suspense fallback={null}>
    <FilterUrlSync />
  </Suspense>
  {children}
</FilterProvider>
```

`fallback={null}` means nothing renders while search params are being read (which is instantaneous on the client). `FilterUrlSync` returns `null` anyway. The `<Suspense>` is a sibling of `{children}` — the map and all filter UI render immediately without waiting for URL sync to initialize.

#### How it interacts with the auto-zoom logic

There's a nice emergent interaction here: when `INIT_FROM_URL` sets a non-default state/county/city, `CrashLayer`'s existing auto-zoom logic fires automatically. The `prevGeoRef` comparison detects that state changed (from `'Washington'` to `'Ohio'`, say), sets `zoomPendingRef = true`, and when data arrives the map zooms to fit Ohio's crashes. A shared URL with `?state=Ohio&county=Franklin` will both filter the data AND zoom the map to Franklin County — no special handling required.

---

### Step 7: Google Street View Link and Copy Report Number

Two small but high-value additions to the crash popup: a Street View link so users can see the location, and a copy-to-clipboard button for the report number so they can paste it into the WSP crash report lookup portal.

#### The URL Scheme

Google Maps accepts a deep-link URL that opens Street View directly at a latitude/longitude:

```text
https://www.google.com/maps/@?api=1&map_action=pano&viewpoint={lat},{lng}
```

- `map_action=pano` — opens the panoramic Street View viewer rather than the regular map
- `viewpoint={lat},{lng}` — centers the view at the given coordinates

This is a stable, documented Google Maps URL scheme that works on both desktop and mobile (mobile opens the Maps app if installed).

#### Adding the Link

The `selectedCrash` state in `MapContainer.tsx` already holds `latitude` and `longitude` — the coordinates of the clicked crash. We just need to construct the URL and add a link at the bottom of the popup:

```tsx
<div className="mt-2 border-t pt-1.5" style={{ borderColor: 'var(--border)' }}>
  <a
    href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${selectedCrash.latitude},${selectedCrash.longitude}`}
    target="_blank"
    rel="noopener noreferrer"
    className="text-[12px]"
    style={{ color: 'var(--primary)', textDecoration: 'underline' }}
  >
    Open Street View
  </a>
</div>
```

A few details worth noting:

- **`border-t` divider** — visually separates the link from the crash details above it, following the same pattern as section dividers elsewhere in the UI
- **`var(--border)` and `var(--primary)`** — inline CSS custom property references that respond to dark mode at runtime, consistent with the rest of the popup (see the popup dark mode step)
- **`rel="noopener noreferrer"`** — standard security attribute for any `target="_blank"` link that navigates away from the current page
- **`text-[12px]`** — slightly smaller than the popup body text (`13px`) to visually de-emphasize it as a utility link rather than primary data

#### Copy Report Number to Clipboard

The WSP crash report portal (`wrecr.wsp.wa.gov/wrecr/order`) requires the user to manually enter the collision report number to look up a crash. We can't pre-fill it (cross-origin JavaScript is blocked by the browser's same-origin policy, and the site is a React SPA that doesn't read URL query parameters). The next-best thing is a one-click copy button.

The report number row becomes a flex container with the existing link and a small icon button:

```tsx
<div className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
  <span>
    Report #:{' '}
    <a href="https://wrecr.wsp.wa.gov/wrecr/order" target="_blank" rel="noopener noreferrer" ...>
      {selectedCrash.colliRptNum}
    </a>
  </span>
  <button
    onClick={() => handleCopyReportNum(selectedCrash.colliRptNum!)}
    title="Copy report number"
    style={{ color: 'var(--muted-foreground)', lineHeight: 1 }}
  >
    {copied ? <Check size={11} /> : <Copy size={11} />}
  </button>
</div>
```

The `copied` state and handler live in `MapContainer`:

```tsx
const [copied, setCopied] = useState(false)

const handleCopyReportNum = useCallback((num: string) => {
  navigator.clipboard.writeText(num)
  setCopied(true)
  setTimeout(() => setCopied(false), 2000)
}, [])
```

A few notes:

- **`useCallback` with empty deps** — `handleCopyReportNum` never changes; wrapping it avoids re-creating the function on every render
- **`lineHeight: 1` on the button** — removes the extra line-height gap that would otherwise push the icon slightly off center relative to the text
- **`!` non-null assertion** on `colliRptNum` in the `onClick` — safe because the entire block is gated on `selectedCrash.colliRptNum &&`
- **`Check` icon for 2 seconds** — a standard confirmation pattern; the timeout resets automatically without any cleanup needed since the component remounts when a new crash is selected

---

### Step 8: Data Export

One of the most requested features in data visualization tools is the ability to download the underlying data. We'll add a CSV export that respects the current filters — so a user viewing Washington pedestrian crashes in 2025 can download exactly that dataset.

#### Why CSV?

CSV is the most universally compatible format for tabular data: it opens in Excel, Google Sheets, R, Python, and any text editor. We'll add a BOM (byte order mark) prefix so Excel recognizes the UTF-8 encoding and doesn't mangle special characters.

#### The CSV utility

Create `lib/csv-export.ts` with two pure functions — no external dependencies needed:

```typescript
type CrashRow = {
  colliRptNum: string
  crashDate?: string | null
  time?: string | null
  injuryType?: string | null
  mode?: string | null
  state?: string | null
  county?: string | null
  city?: string | null
  jurisdiction?: string | null
  region?: string | null
  ageGroup?: string | null
  involvedPersons?: number | null
  latitude?: number | null
  longitude?: number | null
}

const HEADERS = [
  'Collision Report #',
  'Date',
  'Time',
  'Injury Type',
  'Mode',
  'State',
  'County',
  'City',
  'Jurisdiction',
  'Region',
  'Age Group',
  'Involved Persons',
  'Latitude',
  'Longitude',
]

function escapeCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function generateCsv(items: CrashRow[]): string {
  const rows = items.map((item) => [
    item.colliRptNum,
    item.crashDate ?? '',
    item.time ?? '',
    item.injuryType ?? '',
    item.mode ?? '',
    item.state ?? '',
    item.county ?? '',
    item.city ?? '',
    item.jurisdiction ?? '',
    item.region ?? '',
    item.ageGroup ?? '',
    item.involvedPersons?.toString() ?? '',
    item.latitude?.toString() ?? '',
    item.longitude?.toString() ?? '',
  ])
  const lines = [HEADERS, ...rows].map((row) => row.map(escapeCell).join(','))
  return '\ufeff' + lines.join('\r\n') // BOM prefix for Excel compatibility
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
```

A few notes:

- **`escapeCell`** — standard CSV escaping: wrap any cell containing a comma, double quote, or newline in double quotes, and double any embedded double quotes
- **`\ufeff` BOM** — Excel on Windows needs this to correctly detect UTF-8 encoding; without it, names with accented characters (common in city/jurisdiction names) will appear garbled
- **`\r\n` line endings** — the CSV spec (RFC 4180) calls for CRLF; Excel and most parsers accept LF-only too, but CRLF is safer
- **`URL.createObjectURL` + programmatic click** — the standard browser download pattern; the URL is revoked immediately after clicking to free memory
- **No external dependencies** — `papaparse` is a popular option, but our data shape is simple enough that a few lines of escaping logic is all we need

#### The export GraphQL query

The existing `GET_CRASHES` map query fetches a limited field set (just what's needed for the map circles). For export we want the full record. Add a separate query to `lib/graphql/queries.ts`:

```typescript
export const GET_CRASHES_EXPORT = gql`
  query GetCrashesExport($filter: CrashFilter, $limit: Int) {
    crashes(filter: $filter, limit: $limit) {
      items {
        colliRptNum
        crashDate
        time
        injuryType
        mode
        state
        county
        city
        jurisdiction
        region
        ageGroup
        involvedPersons
        latitude
        longitude
      }
      totalCount
    }
  }
`
```

Using a separate query document means Apollo caches map data and export data independently — switching filters invalidates both caches correctly, and clicking Export twice with the same filters reuses the cached result without a new network request.

#### The ExportButton component

Create `components/export/ExportButton.tsx` as a self-contained client component. It reads filter state from context, fires a lazy query on click, and triggers the download when data arrives:

```typescript
'use client'

import { Download, Loader2 } from 'lucide-react'
import { useLazyQuery } from '@apollo/client/react'
import { Button } from '@/components/ui/button'
import { useFilterContext, toCrashFilter } from '@/context/FilterContext'
import { GET_CRASHES_EXPORT, type GetCrashesExportQuery } from '@/lib/graphql/queries'
import { generateCsv, downloadCsv } from '@/lib/csv-export'
import type { FilterState } from '@/context/FilterContext'

function buildFilename(filterState: FilterState): string {
  const parts: string[] = ['crashmap']
  if (filterState.state) parts.push(filterState.state.toLowerCase().replace(/\s+/g, '-'))
  if (filterState.county) parts.push(filterState.county.toLowerCase().replace(/\s+/g, '-'))
  if (filterState.city) parts.push(filterState.city.toLowerCase().replace(/\s+/g, '-'))
  if (filterState.dateFilter.type === 'year') {
    parts.push(String(filterState.dateFilter.year))
  } else if (filterState.dateFilter.type === 'range') {
    parts.push(filterState.dateFilter.startDate.slice(0, 10))
    parts.push(filterState.dateFilter.endDate.slice(0, 10))
  }
  parts.push(new Date().toISOString().slice(0, 10))
  return parts.join('-') + '.csv'
}

interface ExportButtonProps {
  variant?: 'icon' | 'full'
}

export function ExportButton({ variant = 'icon' }: ExportButtonProps) {
  const { filterState } = useFilterContext()
  const [fetchCrashes, { loading }] = useLazyQuery<GetCrashesExportQuery>(GET_CRASHES_EXPORT)

  async function handleExport() {
    const { data } = await fetchCrashes({
      variables: { filter: toCrashFilter(filterState), limit: 5000 },
    })
    if (!data) return
    const csv = generateCsv(data.crashes.items)
    downloadCsv(csv, buildFilename(filterState))
  }

  if (variant === 'full') {
    return (
      <Button variant="outline" size="sm" onClick={handleExport} disabled={loading} className="w-full gap-2">
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        {loading ? 'Exporting…' : 'Export CSV'}
      </Button>
    )
  }

  return (
    <Button variant="ghost" size="icon" onClick={handleExport} disabled={loading} aria-label="Export CSV" title="Export CSV">
      {loading ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
    </Button>
  )
}
```

Key design decisions:

- **`useLazyQuery`** — unlike `useQuery` (which fires immediately on mount), `useLazyQuery` returns a trigger function. We call it only when the user clicks Export, keeping the initial page load fast
- **`'use client'`** — required because this component uses browser APIs (`URL.createObjectURL`) and React hooks
- **Two variants** — `icon` renders a small ghost icon button that fits inside the SummaryBar pill without breaking its layout; `full` renders a full-width labeled button for the Sidebar and FilterOverlay footers
- **`buildFilename`** — constructs a human-readable filename from the active filters so exported files are self-describing: `crashmap-washington-king-2025-2026-02-20.csv`
- **`disabled={loading}`** — prevents double-clicks from firing duplicate requests while the first is in flight; the spinner gives visual feedback

#### Placing the button in the UI

The `icon` variant goes in the SummaryBar. Since `SummaryBar` is a presentational component, add an `actions?: React.ReactNode` prop and render it after the filter badges:

```tsx
{
  actions && (
    <>
      <div className="h-4 w-px bg-border" aria-hidden="true" />
      {actions}
    </>
  )
}
```

Then in `AppShell`, pass the button as the slot:

```tsx
<SummaryBar
  crashCount={filterState.totalCount}
  activeFilters={getActiveFilterLabels(filterState)}
  isLoading={filterState.isLoading}
  actions={<ExportButton variant="icon" />}
/>
```

The `full` variant goes at the bottom of `Sidebar` and as a sticky footer in `FilterOverlay`:

```tsx
// Sidebar — inside the filters div
<ExportButton variant="full" />

// FilterOverlay — after the scrollable content div
<div className="border-t px-4 py-3">
  <ExportButton variant="full" />
</div>
```

This gives users three ways to trigger an export: the always-visible icon in the summary bar, the button at the bottom of the desktop sidebar, and the button in the mobile overlay footer.

---

### Step 9: About Panel and Pinnable Panels

#### The About panel

At this point the app has rich filtering but no context for users: what is this data? How is it collected? What do the map symbols mean? We add an About panel that mirrors the Filters panel structurally but lives on the left side of the screen.

Three new files:

- `components/info/InfoPanelContent.tsx` — the static content itself (no hooks, no client state)
- `components/info/InfoOverlay.tsx` — mobile full-screen overlay (same pattern as `FilterOverlay`, `md:hidden`)
- `components/info/InfoSidePanel.tsx` — desktop panel; flex-column sibling that pushes the map

`InfoPanelContent` renders four sections: a dedication paragraph, "The Data" (methodology + link to the WSDOT Crash Data Portal), a map key (colored circles matching the actual Mapbox layer colors and opacities), and a data disclaimer. An "About" `<h2>` with a version/date sub-line sits at the top.

#### Desktop panel layout

Both desktop panels are permanent flex-column siblings to the map container — they push the map rather than overlaying it. Opening and closing is handled by toggling the panel out of the DOM entirely; there is no Sheet/drawer animation on desktop.

`AppShell` returns a flex container:

```tsx
<div className="flex w-full h-full">
  {/* Left: info panel */}
  {infoPanelOpen && <InfoSidePanel onClose={() => setInfoPanelOpen(false)} ... />}

  {/* Center: map + overlays */}
  <div className="flex-1 relative" style={{ minWidth: 0 }}>
    <MapContainer ref={mapRef} />
    ...
  </div>

  {/* Right: filter panel */}
  {sidebarOpen && <Sidebar onClose={() => setSidebarOpen(false)} />}
</div>
```

Call `map.resize()` after any panel state change. Use a 0ms timeout — it fires after the DOM reflows so Mapbox sees the correct new canvas size immediately, with no unnecessary delay:

```tsx
useEffect(() => {
  const id = setTimeout(() => mapRef.current?.resize(), 0)
  return () => clearTimeout(id)
}, [sidebarOpen, overlayOpen, infoPanelOpen, infoOverlayOpen])
```

Both panels default to open on desktop. The Info/Heart/Sliders buttons reopen their respective panels after the user closes them with the X button.

#### Emoji favicon

Set the tab icon to an emoji with no image asset required — an inline SVG data URI in the Next.js `metadata` export:

```tsx
export const metadata: Metadata = {
  title: 'CrashMap',
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💥</text></svg>",
  },
}
```

This takes priority over any `favicon.ico` file and works in all modern browsers.

---

### Step 10: Summary Bar Redesign

#### Emoji mode badges and shorter filter labels

The `SummaryBar` initially used text labels like "All modes", "Bicyclists", "Pedestrians" for the mode badge. Replacing them with emojis reduces visual noise and saves horizontal space — critical on mobile where the bar has minimal room.

Update `getActiveFilterLabels` in `context/FilterContext.tsx`:

```ts
// Mode: use emoji(s) instead of text
if (filterState.mode === 'Bicyclist') {
  labels.push('🚲')
} else if (filterState.mode === 'Pedestrian') {
  labels.push('🚶🏽‍♀️')
} else {
  labels.push('🚲 🚶🏽‍♀️')
}
```

Similarly, shorten year labels (`2025` → `'25`) and remove the state label entirely (since only Washington data is in the app). When a city is selected, skip the county label — the city name is sufficient context:

```ts
// Year: short format
if (filterState.dateFilter.type === 'year') {
  labels.push(`'${String(filterState.dateFilter.year).slice(2)}`)
}

// Geographic: no state; county only if no city
if (!filterState.city && filterState.county) labels.push(filterState.county)
if (filterState.city) labels.push(filterState.city)
```

#### Crash count moved to filter panels

Displaying the crash count in the floating `SummaryBar` wastes space on mobile. Instead, show it at the top of the filter panels where it's in context alongside the active filter controls.

In `Sidebar.tsx`, add it to the top of `FilterContent`:

```tsx
function FilterContent() {
  const { filterState } = useFilterContext()
  return (
    <div className="space-y-6 px-4 py-4">
      {filterState.totalCount !== null && (
        <p className="text-sm text-muted-foreground">
          {filterState.totalCount.toLocaleString()} crashes
        </p>
      )}
      {/* ... rest of filters */}
    </div>
  )
}
```

In `FilterOverlay.tsx`, add it to the header below the title:

```tsx
<div>
  <h2 className="text-base font-semibold">Filters</h2>
  {filterState.totalCount !== null && (
    <p className="text-xs text-muted-foreground">
      {filterState.totalCount.toLocaleString()} crashes
    </p>
  )}
</div>
```

#### Mobile summary bar — flush-bottom strip

The floating pill (`absolute bottom-6 ... rounded-full`) works well on desktop but is awkward on mobile — it floats over the map and obscures crash dots. The better pattern for mobile is a thin strip pinned to the very bottom of the viewport, similar to a browser bottom tab bar.

Use responsive Tailwind classes to switch between the two layouts at the `md` breakpoint. The key insight is that `fixed` (mobile) can be overridden by `md:absolute` because media query rules take precedence over base rules at the matching breakpoint:

```tsx
className="
  fixed bottom-0 left-0 right-0 z-10
  flex items-center gap-2 border-t
  bg-background/90 px-3 py-1.5 shadow-sm backdrop-blur-sm
  md:absolute md:bottom-3 md:left-1/2 md:right-auto md:w-auto
  md:-translate-x-1/2 md:rounded-md md:border md:px-4 md:py-1 md:shadow-md
"
```

On mobile this produces a full-width strip with a single top border, flush against the viewport bottom. On desktop (`md:`) it becomes a compact floating bar centered horizontally, positioned just `12px` from the bottom of the map area, with `rounded-md` corners matching the icon buttons at the top of the UI.

The export button is also hidden on mobile (the Filters overlay has a full-width Export button instead):

```tsx
{
  actions && (
    <div className="hidden md:flex items-center gap-1 ml-auto">
      <div className="h-4 w-px bg-border" aria-hidden="true" />
      {actions}
    </div>
  )
}
```

#### Popup viewport centering — zoom in and restore on close

When a user clicks a crash dot, the map should zoom in and tilt toward that location, then snap back to the original view when the popup is dismissed. This creates a clear focus-and-return pattern without losing the user's place.

There are three sub-problems to solve:

1. **Accessing the map imperatively** — `MapContainer` uses `forwardRef` to expose its `MapRef` to `AppShell` (for `map.resize()`). We need an internal ref for `flyTo()` calls without breaking the external one.
2. **Saving viewport state without extra renders** — the "before" view (center, zoom, pitch, bearing) only needs to be restored once; storing it in a `ref` instead of `useState` avoids unnecessary re-renders.
3. **Crash-to-crash navigation** — if the user clicks a second crash while one popup is open, the map should fly to the new crash but restore all the way back to the _original_ viewport, not the already-zoomed first crash.

#### Split the internal and external refs with `useImperativeHandle`

Replace the single `ref={ref}` on `<Map>` with an internal ref and forward it explicitly:

```tsx
import { forwardRef, useRef, useImperativeHandle } from 'react'

export const MapContainer = forwardRef<MapRef>(function MapContainer(_, ref) {
  const internalMapRef = useRef<MapRef>(null)
  useImperativeHandle(ref, () => internalMapRef.current!)

  // ...

  return <Map ref={internalMapRef} ...>
})
```

`useImperativeHandle` proxies the forwarded `ref` to `internalMapRef.current` — `AppShell` still gets a valid `MapRef` (with `resize()`, etc.) while we gain direct access to the map inside the component.

#### Capture the viewport on click

Add a `savedViewportRef` to hold the pre-click state:

```tsx
type SavedViewport = {
  center: [number, number]
  zoom: number
  bearing: number
  pitch: number
}

const savedViewportRef = useRef<SavedViewport | null>(null)
```

In the click handler, save only when no popup is already open, then fly to the crash:

```tsx
const map = internalMapRef.current?.getMap()

// Save viewport only once — clicking crash-to-crash keeps the original
if (map && !savedViewportRef.current) {
  const center = map.getCenter()
  savedViewportRef.current = {
    center: [center.lng, center.lat],
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  }
}

map?.flyTo({
  center: coords,
  zoom: 15.5,
  pitch: 45,
  duration: 800,
  essential: true,
})
```

`essential: true` marks the animation as non-interruptible by `prefers-reduced-motion` accessibility settings (appropriate here since it's user-initiated). The `!savedViewportRef.current` guard is what enables crash-to-crash navigation: the first click saves the original view; subsequent clicks while a popup is open skip the save, so the restore always returns to the true original.

#### Restore on close

Extract popup dismissal into a dedicated `closePopup` callback:

```tsx
const closePopup = useCallback(() => {
  setSelectedCrash(null)
  const saved = savedViewportRef.current
  if (saved && internalMapRef.current) {
    internalMapRef.current.getMap()?.flyTo({
      center: saved.center,
      zoom: saved.zoom,
      bearing: saved.bearing,
      pitch: saved.pitch,
      duration: 800,
      essential: true,
    })
    savedViewportRef.current = null
  }
}, [])
```

Wire it to both the popup's close button and clicking empty space:

```tsx
// Popup close button
<Popup onClose={closePopup} ...>

// Click handler — empty space branch
if (!feature || feature.geometry.type !== 'Point') {
  closePopup()
  return
}
```

The result: clicking a crash zooms the map to street level (zoom 15.5) with a 45° pitch, and clicking anywhere else (or the X) smoothly returns to exactly where the user was before.

---

### Step 11: Update Search as Map Moves

#### The Goal

We want a toggle that switches the crash query from "filter by state/county/city text" to "filter by whatever's currently visible on the map." When the user pans or zooms, the query automatically updates. County and city filters should also be decoupled so either can be selected independently.

#### Why the Naive Approach Fails

The existing `map.getBounds()` method seems like the obvious tool here, but it has a subtle gotcha: Mapbox stores **camera padding** when you call `fitBounds({ padding: 80 })`. After that, `getBounds()` returns the bounds of the inner _un-padded_ area — the viewport minus the padding margin — not the full canvas. The result is a bounding box that's noticeably smaller than what the user sees.

The fix is to unproject the actual canvas corners:

```ts
const canvas = map.getCanvas()
const sw = map.unproject([0, canvas.clientHeight]) // bottom-left pixel
const ne = map.unproject([canvas.clientWidth, 0]) // top-right pixel
```

`unproject()` converts screen pixels directly to geographic coordinates, bypassing all camera transforms and padding. We also add a 5% buffer in each direction so crashes near the edges load before the user pans to them.

#### The `updateWithMovement` State

Add `updateWithMovement: boolean` to `FilterState` and `UrlFilterState`, along with a `SET_UPDATE_WITH_MOVEMENT` action. Persisted in the URL as `?movement=1`.

When `updateWithMovement` is on:

- The crash query replaces `state`/`county`/`city` with a `bbox` input computed from the map viewport
- The county and city selectors in the UI are disabled and greyed out
- Auto-zoom on geographic filter change is suppressed (the user is navigating manually)
- The active filter badge shows "📍 Viewport" instead of a county/city name

#### The `moveend` Listener Pattern

In `CrashLayer`, when `updateWithMovement` turns on:

1. Immediately capture the current viewport as the initial bbox
2. Register a `moveend` listener that re-captures on each pan/zoom-end
3. The bbox is local state (`useState`) in `CrashLayer` — it drives a new query variable, triggering Apollo to refetch

```ts
useEffect(() => {
  if (!map || !filterState.updateWithMovement) return

  function captureBbox() {
    const canvas = map.getCanvas()
    const sw = map.unproject([0, canvas.clientHeight])
    const ne = map.unproject([canvas.clientWidth, 0])
    const latBuf = (ne.lat - sw.lat) * 0.05
    const lngBuf = (ne.lng - sw.lng) * 0.05
    setBbox({
      minLat: sw.lat - latBuf,
      minLng: sw.lng - lngBuf,
      maxLat: ne.lat + latBuf,
      maxLng: ne.lng + lngBuf,
    })
  }

  captureBbox() // seed immediately
  map.on('moveend', captureBbox)
  return () => map.off('moveend', captureBbox)
}, [map, filterState.updateWithMovement])
```

Using `moveend` (not `move`) means the query only fires when the user finishes interacting, not on every animation frame.

#### Preventing the Flash with `previousData`

When the bbox changes, Apollo receives new query variables it hasn't seen before — a **cache miss**. For a brief moment, `data` is `undefined` while the network request is in flight. Without a fix, the component hits `if (!data) return null` and unmounts all the crash dots, causing a jarring flash.

Apollo's `useQuery` returns a `previousData` field that holds the last successful result. The fix is one line:

```ts
const { data, previousData, loading } = useQuery(...)
const displayData = data ?? previousData
```

During a loading refetch, `displayData` falls back to the previous result so the old dots stay rendered. When the new response arrives, `displayData` switches to the fresh set — new dots appear, out-of-viewport dots disappear, with no blank-map flash in between.

#### Decoupling County and City

Previously, selecting a county would clear the city selection, and the city dropdown only loaded cities within the selected county. The new behavior:

- `SET_COUNTY` no longer resets `city` in the reducer
- Both dropdowns always load all Washington options (county query: `state: 'Washington'`; city query: `state: 'Washington'` with no county filter)
- A user can select King County and Seattle independently — if the city isn't in the county, the DB returns no results (correct)
- URL decode likewise drops the old "city only valid if county is set" guard

#### Removing the State Selector

Since all data is from Washington, the State selector was removed from the Location filter UI. `state: 'Washington'` remains hardcoded in `toCrashFilter()` so the GraphQL query still filters by state for index efficiency, but users never see or interact with it.

---

### Step 12: CI/CD Pipeline and Staging Environment

With the core feature set in place, it's time to harden the deployment pipeline. The goal is a setup where:

- **Every push to `main`** triggers a full CI check (lint, types, tests, codegen, build) and — only if all checks pass — automatically deploys to production on Render.
- **A `staging` branch** gives you a live environment to verify changes before they touch production, without requiring CI to pass first.

#### The Problem with Render's Built-in Auto-Deploy

Render's default "Auto-Deploy" setting watches the GitHub repo and deploys on every push to the tracked branch. This has two issues:

1. It deploys even if CI fails — a broken build ships.
2. There's no way to inject a separate CI gate between the git push and the deploy.

The fix is to set `autoDeploy: false` on the production service and use a **Render deploy hook** — a private URL you POST to when you want a deploy to happen. The CI workflow calls this URL only after all checks pass.

#### Updating render.yaml

The `render.yaml` Blueprint file declares both services:

```yaml
services:
  - type: web
    name: crashmap
    runtime: node
    branch: main
    autoDeploy: false # only CI can trigger production deploys
    buildCommand: >-
      npm ci && npm run build &&
      cp -r public .next/standalone/public &&
      cp -r .next/static .next/standalone/.next/static
    startCommand: node .next/standalone/server.js
    nodeVersion: 20
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: NEXT_PUBLIC_MAPBOX_TOKEN
        sync: false
      - key: NEXT_PUBLIC_APP_URL
        sync: false

  - type: web
    name: crashmap-staging
    runtime: node
    branch: staging
    autoDeploy: true # staging deploys freely on every push
    buildCommand: >-
      npm ci && npm run build &&
      cp -r public .next/standalone/public &&
      cp -r .next/static .next/standalone/.next/static
    startCommand: node .next/standalone/server.js
    nodeVersion: 20
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: NEXT_PUBLIC_MAPBOX_TOKEN
        sync: false
      - key: NEXT_PUBLIC_APP_URL
        sync: false
```

Since CrashMap is a read-only public app (no mutations), staging and production can safely share the same database — there's no risk of staging writes corrupting production data.

#### Creating the Staging Branch

```bash
git checkout -b staging main
git push origin staging
```

In the Render dashboard, create the `crashmap-staging` web service manually (there's no Blueprint sync UI in all plan tiers): connect the same GitHub repo, set branch to `staging`, use the same build/start commands, set `autoDeploy` to on. Then set the three env vars (`DATABASE_URL`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `NEXT_PUBLIC_APP_URL`).

#### Wiring the Deploy Hook to GitHub Actions

In the Render dashboard for the production `crashmap` service, go to **Settings → Deploy Hook** and copy the private URL. Add it to GitHub as a repository secret named `RENDER_DEPLOY_HOOK_PRODUCTION` (Settings → Secrets and variables → Actions → New repository secret).

#### Codegen Drift Check

The generated types file (`lib/graphql/__generated__/types.ts`) is committed to the repo. If someone updates `typeDefs.ts` or `resolvers.ts` but forgets to run `npm run codegen`, the committed types silently go stale. The CI drift check catches this:

```yaml
- name: Codegen drift check
  run: |
    npm run codegen
    git diff --exit-code lib/graphql/__generated__/types.ts
```

`git diff --exit-code` returns a non-zero exit code if the file changed — failing the job. This forces the developer to run `npm run codegen` locally and commit the result before CI will pass.

#### First Run: The Prettier/Codegen Conflict

Adding the drift check surfaced a subtler problem. The check failed on first run, not because of schema drift, but because of a conflict between codegen's output format and the project's prettier config.

`@graphql-codegen/typescript` generates TypeScript with trailing semicolons. But our `.prettierrc` has `"semi": false`. When a developer runs `npm run codegen` and then tries to commit `types.ts`, lint-staged runs prettier on the staged file, strips all the semicolons, and the file reverts to match what was already committed — producing an empty diff. Husky then blocks the commit with "lint-staged prevented an empty git commit."

The cycle looks like this:

```text
codegen generates → types.ts has semis
prettier runs     → types.ts has no semis (matches committed)
git sees no diff  → nothing to commit → commit blocked
```

The CI drift check then fails too, because `npm run codegen` always produces a file with semis that differs from the no-semi committed version.

**The fix:** pipe prettier through the `codegen` script itself, so the output is already in the project's style before it ever touches git:

```json
"codegen": "graphql-codegen --config codegen.ts && prettier --write lib/graphql/__generated__/types.ts"
```

Now the cycle resolves cleanly:

```text
codegen generates → types.ts has semis
prettier runs     → types.ts has no semis
committed file    → no semis (same)
git diff          → no changes → drift check passes, commit succeeds
```

**Takeaway:** whenever you use a codegen drift check, make sure the `codegen` script produces output that already conforms to the project's prettier config. The simplest way is to add `&& prettier --write <output-file>` to the codegen script.

#### The Updated CI Workflow

The workflow splits into two jobs:

- **`check`** — runs on every branch push: lint, format, typecheck, test, codegen drift, build.
- **`deploy`** — runs only on `main` pushes, only after `check` passes; calls the Render deploy hook.

```yaml
deploy:
  needs: check
  runs-on: ubuntu-latest
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'

  steps:
    - name: Deploy to Render (production)
      run: curl -X POST "${{ secrets.RENDER_DEPLOY_HOOK_PRODUCTION }}"
```

The `needs: check` dependency means this job is skipped entirely if `check` fails. The `if:` guard means it only runs on direct pushes to `main` (i.e., when a PR is merged) — not on feature branch pushes.

#### The Full Flow

```text
Feature branch → PR → CI (check job) runs on the branch
                    → CI passes → merge to main
                                → CI (check job) runs on main
                                → check passes → deploy job fires
                                               → POST to Render deploy hook
                                               → production deploys
```

```text
push to staging → Render auto-deploys crashmap-staging immediately
```

Branch protection on `main` (configured in GitHub → Settings → Branches) ensures the `check` job must pass before a PR can be merged, closing the loop.

---

## Phase 6: Iteration — Satellite Map, Map Links, and Popup Refactor

### Step 1: Add a Satellite View Toggle

The Mapbox SDK ships several basemap styles. We want to let users switch to the satellite imagery style (`satellite-streets-v12`) without affecting the rest of the UI's dark/light mode.

#### Store the preference in FilterContext

Add `satellite: boolean` to `FilterState`, `SET_SATELLITE` to `FilterAction`, `satellite: false` to `initialState`, and the matching reducer case in `context/FilterContext.tsx`. This follows the same pattern as `updateWithMovement` — a display preference that doesn't affect the data query.

#### Add the toggle to the filter panel

In `components/filters/GeographicFilter.tsx`, add a `Switch` labeled "Satellite view" in the Map Controls section:

```tsx
<div className="flex items-center gap-2">
  <Switch
    id="satellite-view"
    checked={filterState.satellite}
    onCheckedChange={(checked) => dispatch({ type: 'SET_SATELLITE', payload: checked })}
  />
  <Label htmlFor="satellite-view" className="text-sm cursor-pointer">
    Satellite view
  </Label>
</div>
```

#### Drive the map style from context

In `MapContainer.tsx`, read `filterState.satellite` and override the style resolution:

```ts
const mapStyle = filterState.satellite
  ? 'mapbox://styles/mapbox/satellite-streets-v12'
  : resolvedTheme === 'dark'
    ? 'mapbox://styles/mapbox/dark-v11'
    : 'mapbox://styles/mapbox/light-v11'
```

When satellite is on, Mapbox switches the basemap immediately — no page reload needed. Dark/light mode continues to work normally when satellite is off.

#### Reduce dot opacity on satellite

Crash dots are semi-transparent by design, but against aerial imagery the colors can wash out. Move the layer definitions inside the `CrashLayer` component (so they can reference live state) and subtract 10% opacity when satellite is on:

```ts
const opacityOffset = filterState.satellite ? 0.1 : 0

const deathLayer: LayerProps = {
  paint: {
    'circle-opacity': 0.85 + opacityOffset,
    // ...
  },
}
```

This small nudge (e.g. Death: 0.85 → 0.75) keeps the dots visible and readable against the busier satellite background.

### Step 2: Add Map Links to the Crash Popup

It's useful to let users open a crash location in an external mapping app to explore the street-level context. Add two links at the bottom of the popup:

**Apple Maps** (opens native Maps app on iOS/macOS, web on other platforms):

```tsx
<a
  href={`https://maps.apple.com/?ll=${crash.latitude},${crash.longitude}&z=20`}
  target="_blank"
  rel="noopener noreferrer"
>
  Open in Apple Maps
</a>
```

**Google Street View** (already present — drops into Street View at the crash location):

```tsx
<a
  href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${crash.latitude},${crash.longitude}`}
  target="_blank"
  rel="noopener noreferrer"
>
  Open Street View
</a>
```

Group them in a flex column below a divider so they stack cleanly in the narrow popup.

### Step 3: Extract the Popup into Its Own Component

As the popup grew (links, copy button, color dot, conditional fields), the JSX became a sizable chunk inside `MapContainer.tsx`. Extracting it into `components/map/CrashPopup.tsx` makes each file easier to navigate and reason about.

**What moves into `CrashPopup.tsx`:**

- The `SelectedCrash` type (exported so `MapContainer` can reference it)
- `SEVERITY_COLORS` map
- `formatDate()` helper
- The `copied` state and `handleCopyReportNum` callback (self-contained within the popup)
- All popup JSX

**The component signature:**

```tsx
type CrashPopupProps = {
  crash: SelectedCrash
  onClose: () => void
}

export function CrashPopup({ crash, onClose }: CrashPopupProps) { ... }
```

**MapContainer after the refactor:**

```tsx
import { CrashPopup } from './CrashPopup'
import type { SelectedCrash } from './CrashPopup'

// In the render:
{
  selectedCrash && <CrashPopup crash={selectedCrash} onClose={closePopup} />
}
```

`MapContainer` keeps ownership of `selectedCrash` state and `closePopup` (because closing involves flying the map back to the saved viewport). Everything purely about rendering the popup card lives in `CrashPopup`.

---

## Step N: Monitoring — Sentry (Error Tracking) + Lighthouse CI (Web Vitals)

With the app deployed and publicly accessible, adding observability gives you visibility into real-world errors and performance without waiting for user reports.

### Part 1: Sentry — Error Tracking

**Install the SDK:**

```bash
npm install @sentry/nextjs
```

**Run the wizard** to authenticate with Sentry, wire up the DSN, and generate boilerplate config files:

```bash
npx @sentry/wizard@latest -i nextjs --saas --org <your-org> --project <your-project>
```

The wizard will:

- Create `instrumentation-client.ts` (client-side init — Session Replay, logs, performance tracing)
- Create/overwrite `sentry.server.config.ts` and `sentry.edge.config.ts`
- Update `instrumentation.ts` with `onRequestError = Sentry.captureRequestError`
- Create `app/global-error.tsx` (root-level error boundary)
- Update `next.config.ts` with `withSentryConfig` options including `tunnelRoute: "/monitoring"` (routes browser Sentry requests through your own server to bypass ad blockers)
- Create example test pages under `app/sentry-example-page/` and `app/api/sentry-example-api/` (delete after testing)

**After the wizard — clean up these things:**

1. **Replace the hardcoded DSN** — the wizard embeds your real DSN directly in the config files. Move it to an env var:

   ```ts
   // In instrumentation-client.ts, sentry.server.config.ts, sentry.edge.config.ts:
   dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
   ```

   Using `NEXT_PUBLIC_` is correct: the DSN is already embedded in your JS bundle and is intentionally public. Set it in `.env.local` for development and in Render's environment variables for production.

2. **Delete `sentry.client.config.ts`** if it exists — this was the v7 mechanism. The wizard's `instrumentation-client.ts` supersedes it.

3. **Remove Vercel-only options** from `withSentryConfig` — the wizard adds `automaticVercelMonitors: true` which does nothing on Render. Remove it.

4. **Update `app/error.tsx`** to call `Sentry.captureException` instead of `console.error`:

   ```ts
   import * as Sentry from '@sentry/nextjs'

   useEffect(() => {
     Sentry.captureException(error)
   }, [error])
   ```

5. **Update CSP headers** — with `tunnelRoute`, browser Sentry requests hit `/monitoring` on your own domain (already covered by `'self'` in `connect-src`). But keep the `*.ingest.sentry.io` entries anyway as a fallback:

   ```ts
   "connect-src 'self' https://*.mapbox.com https://events.mapbox.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
   ```

6. **Add `consoleLoggingIntegration`** — enables Sentry Logs, which captures `console.log`, `console.warn`, and `console.error` calls as structured log entries in Sentry's Logs explorer. Add it to all three init files:

   ```ts
   // In sentry.server.config.ts, sentry.edge.config.ts, and instrumentation-client.ts:
   integrations: [
     Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
   ],
   enableLogs: true,
   ```

   For `instrumentation-client.ts`, include it alongside `replayIntegration()`.

7. **Set secrets in GitHub Actions** — for source-map uploads during CI builds:
   - Add `SENTRY_AUTH_TOKEN` as a repository secret (Settings → Secrets → Actions); create the token at Sentry → Settings → Auth Tokens
   - Expose it in the `Build` step of `ci.yml` — secrets are not automatically available to `run` commands:

   ```yaml
   - name: Build
     run: npm run build
     env:
       SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
   ```

   The wizard hardcodes `org` and `project` as literal strings in `next.config.ts` — that's fine to leave as-is.

8. **Declare `NEXT_PUBLIC_SENTRY_DSN` in `render.yaml`** — so Render knows the variable exists for both services (set the actual value in the Render dashboard):

   ```yaml
   - key: NEXT_PUBLIC_SENTRY_DSN
     sync: false
   ```

**Verify it works:** Visit `/sentry-example-page` locally, click the button, and confirm the error appears in your Sentry Issues dashboard within seconds.

> **Note on sub-route redirects:** `FilterUrlSync` uses `router.replace` to sync filter state to the URL. If it replaces with just `?params` (no path), Next.js keeps the current route. But if params are empty (all defaults), the original code replaced to `'/'` literally — which sends you back to the homepage from any sub-route like `/sentry-example-page`. Fix: use `usePathname()` and replace to `${pathname}?${search}` or `pathname` instead.

### Part 2: Lighthouse CI — Web Vitals

Lighthouse CI runs Google's Lighthouse audit against your deployed app and uploads the report to a temporary public URL after every merge to `main`.

**Create `.lighthouserc.json`** in the project root:

```json
{
  "ci": {
    "collect": {
      "url": ["https://crashmap.io"],
      "numberOfRuns": 1
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

**Add a `lighthouse` job to `.github/workflows/ci.yml`:**

```yaml
lighthouse:
  needs: deploy
  runs-on: ubuntu-latest
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'

  steps:
    - uses: actions/checkout@v4

    - name: Wait for Render deployment
      run: |
        echo "Waiting for Render to finish deploying..."
        sleep 180
        for i in $(seq 1 10); do
          status=$(curl -o /dev/null -s -w "%{http_code}" https://crashmap.io)
          if [ "$status" = "200" ]; then
            echo "Site returned 200"
            exit 0
          fi
          echo "Attempt $i: HTTP $status — waiting 30s..."
          sleep 30
        done

    - name: Run Lighthouse CI
      uses: treosh/lighthouse-ci-action@v12
      with:
        configPath: .lighthouserc.json
        uploadArtifacts: true
        temporaryPublicStorage: true
```

The job depends on `deploy`, so it only runs after a successful Render deployment. It waits 3 minutes (Render's typical build time), then polls for a 200 before running Lighthouse. The report link appears in the GitHub Actions step output.

No `assert` block means Lighthouse never fails CI — it's purely observational. For a map-heavy WebGL app you'd expect Performance scores in the 60–80 range depending on device/connection; Accessibility and Best Practices should be 90+.

## Health Check Endpoint

Render uses a health check endpoint to determine when your app is ready to serve traffic after a deploy and to detect when the running service has gone unhealthy. Without one, Render falls back to TCP checks (just verifying the port is open), which can declare a service healthy before Next.js has finished initializing.

### Create the endpoint

Add `app/api/health/route.ts`:

```ts
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ status: 'ok' })
}
```

`force-dynamic` tells Next.js not to statically cache this route. Without it, the build would pre-render the response and every request would receive the cached output — defeating the purpose of a live health check.

### Declare it in render.yaml

Add `healthCheckPath: /api/health` to both services:

```yaml
services:
  - type: web
    name: crashmap
    healthCheckPath: /api/health
    # ...

  - type: web
    name: crashmap-staging
    healthCheckPath: /api/health
    # ...
```

### Set it in the Render dashboard

The `render.yaml` declaration covers new service creation, but for existing services you also need to set it manually:

1. Open the Render dashboard → select the `crashmap` web service
2. Go to **Settings** → **Health & Alerts**
3. Set **Health Check Path** to `/api/health`
4. Save — Render will start polling this path after every deploy

Repeat for `crashmap-staging`.

Render polls the health check path every 10 seconds. If it returns a non-2xx status three consecutive times, Render marks the service as unhealthy and alerts you. During a new deploy, Render waits for the health check to pass before shifting traffic to the new instance.

---

## Adding a Support Panel

### Why

A free public app still has hosting costs. Adding a visible but non-intrusive way for users to support the project is worthwhile — and it belongs in the UI, not buried in a README.

### Approach: Multi-View Left Panel

Rather than adding a third panel type, we reuse the existing left info panel and add a `view` prop (`'info' | 'support'`). A new Heart button in the top-left map controls opens the panel in `'support'` view; the original Info button opens it in `'info'` view. Both views share the same panel shell (header, pin/close buttons, scroll area) — only the content component swaps.

View switching is managed in `AppShell` via `infoPanelView` state and an `onSwitchView` callback passed down to the content components. The content components render a "← Back to Info" or "❤️ Support this App" link that calls the callback, switching the view in-place without closing the panel.

### Key files

- `components/info/PanelCredit.tsx` — Shared author credit block (name + tagline), used at the top of both content views.
- `components/info/SupportPanelContent.tsx` — Support view content: blurb, donate links, contact link.
- `components/info/InfoSidePanel.tsx` — Extended with `view` and `onSwitchView` props; `PanelBody` helper selects the right content component.
- `components/info/InfoOverlay.tsx` — Same extension for the mobile overlay.
- `components/layout/AppShell.tsx` — Adds `infoPanelView` state; Heart button sets view to `'support'` and opens the panel; Info button sets it to `'info'`.

### Dark-mode button fix

The top map buttons use `variant="outline"` which picks up `border-input` in dark mode — `oklch(1 0 0 / 15%)`, a semi-transparent white that looks washed out over the map. Fix: add `className="dark:bg-zinc-900 dark:border-zinc-700"` to each button for a solid, clearly-defined appearance. `ThemeToggle` needed a one-line `className` prop added to pass the class through to the underlying `Button`.

### Accessible color scale

Map dots rely on color to communicate severity — which is a problem for the ~8% of males with red-green color blindness who can't distinguish the standard dark-red / orange / yellow / green scale. We add a toggle that swaps to the **Paul Tol Muted** palette, a scheme specifically engineered to be distinguishable under all forms of color vision deficiency (protanopia, deuteranopia, tritanopia).

**Step 1 — Centralize color constants.** Rather than scattering hex codes across multiple files (a pre-existing bug: `SeverityFilter.tsx` and `CrashLayer.tsx` had slightly different values), create `lib/crashColors.ts` with two exported maps:

```ts
export const STANDARD_COLORS: Record<SeverityBucket, string> = {
  None: '#C5E1A5',
  'Minor Injury': '#FDD835',
  'Major Injury': '#F57C00',
  Death: '#B71C1C',
}
export const ACCESSIBLE_COLORS: Record<SeverityBucket, string> = {
  None: '#44AA99',
  'Minor Injury': '#DDCC77',
  'Major Injury': '#CC6677',
  Death: '#332288',
}
```

**Step 2 — Add state.** In `FilterContext.tsx`, add `accessibleColors: boolean` to `FilterState` (default `false`), a `SET_ACCESSIBLE_COLORS` action, and a reducer case — exactly mirroring the existing `satellite` toggle. No URL persistence needed (it's a visual preference, not a data filter).

**Step 3 — Wire up the map layers.** In `CrashLayer.tsx`, derive a `colors` variable from `filterState.accessibleColors` and use it for all four `circle-color` paint properties instead of hardcoded hex values.

**Step 4 — Wire up the UI legend.** In `SeverityFilter.tsx` and `InfoPanelContent.tsx`, do the same: pick from `STANDARD_COLORS` or `ACCESSIBLE_COLORS` based on `filterState.accessibleColors`. `InfoPanelContent` needs `'use client'` added since it now calls `useFilterContext()`.

**Step 5 — Add the toggle controls.** Two entry points for the same state:

- An `Eye` icon button in `AppShell.tsx` to the left of the theme toggle. Use `variant="default"` when active so the filled button communicates state at a glance.
- A `Switch` in `GeographicFilter.tsx` under Map Controls, alongside the existing "Satellite view" toggle — consistent pattern, accessible from the filter panel.

The result: users can enable the accessible palette from either the map toolbar or the filter panel, and the map dots, severity checkboxes, and info panel legend all update instantly in sync.

---

## Date Filter Overhaul

### Step: Establishing a React file structure convention

As components grew more complex, we adopted a consistent internal ordering for all React files. Every component now layers its contents in this order — no section labels or comments needed:

1. Imports
2. Types & interfaces
3. Small helper components
4. Main component function
5. Hooks (useState, useEffect, useQuery, context)
6. Guard clauses (early returns)
7. Render (return statement)

This makes it easy to scan any file and immediately find what you're looking for.

### Step: Overhauling the date range picker

The original `DateFilter` used a basic `react-day-picker` Calendar with `mode="range"` and committed the range as soon as both dates were clicked. Several UX problems accumulated over time:

1. **Calendar jumped to today's month** after the first click, because react-day-picker v9 auto-navigates to the `selected` prop when it changes.
2. **No year navigation** — the user could only move month-by-month.
3. **No text entry** — no way to type a date directly.
4. **Instant commit** — selecting the second date immediately fired the filter with no chance to review.

We fixed all four in a single pass by adding a controlled `month` state:

```tsx
const [month, setMonth] = useState<Date>(() => new Date())
// ...
<Calendar month={month} onMonthChange={setMonth} ... />
```

With `month` controlled externally, react-day-picker stops auto-navigating. The `«`/`»` year buttons and `<`/`>` month buttons both write to the same state.

**Year arrows** sit in a thin row between the text inputs and the calendar, giving two levels of navigation without overwhelming the UI.

**Start/End text inputs** (MM/DD/YYYY format) live at the top of the popover. They use bidirectional sync:

- Calendar click → fills both inputs via `format(date, 'MM/dd/yyyy')`
- Typing a valid date → updates the calendar highlight and navigates the month

**Deferred commit** — dates are no longer applied the moment the second is clicked. Instead:

- An **Apply** button appears once a complete pending range exists
- Clicking **outside** the popover also commits if the range is complete
- **Clear** appears when a committed range exists

The `doCommit()` helper returns a boolean so `handleApply` can keep the popover open on validation failure.

### Step: Data bounds in FilterContext

To validate user-entered dates, we need to know the actual date range of data in the database. We added `minDate` and `maxDate` to the existing `FilterOptions` GraphQL type:

```graphql
type FilterOptions {
  # ... existing fields
  minDate: String # earliest CrashDate as YYYY-MM-DD
  maxDate: String # latest CrashDate as YYYY-MM-DD
}
```

Each resolver runs a simple aggregate query:

```ts
minDate: async () => {
  const result = await prisma.$queryRaw<[{ min: Date | null }]>`
    SELECT MIN("CrashDate") as min FROM crashdata
  `
  return result[0]?.min?.toISOString().slice(0, 10) ?? null
},
```

On the client side, `dataBounds: { minDate: string; maxDate: string } | null` was added to `FilterState` (initialized to `null`). A `useQuery(GET_FILTER_OPTIONS)` call in `DateFilter` dispatches `SET_DATE_BOUNDS` when the data arrives. Since Apollo caches the result, this runs once per app load.

### Step: Toast validation errors

We installed [Sonner](https://sonner.emilkowal.ski/) via `npx shadcn@latest add sonner` and added `<Toaster />` to `app/layout.tsx`.

Validation runs in `doCommit()` before dispatching to FilterContext:

```ts
function validateRange(from: Date, to: Date): string | null {
  if (isBefore(to, from)) return 'Start date must be before end date'
  if (dataBounds) {
    const min = parseISO(dataBounds.minDate)
    const max = parseISO(dataBounds.maxDate)
    if (isBefore(from, min))
      return `Data starts ${format(min, DATE_INPUT_FORMAT)} — no earlier records available`
    if (isAfter(to, max))
      return `Data ends ${format(max, DATE_INPUT_FORMAT)} — no later records available`
  }
  return null
}
```

Text inputs also fire a format error toast when the user types exactly 10 characters (the full `MM/DD/YYYY` length) but the value fails `isValid(parse(...))`.

---

## Date Filter — shadcn Range Calendar Refactor

### Overview

The custom date picker (text inputs, year-nav arrows, Apply button, deferred-commit) was replaced with the standard shadcn Range Calendar. This reduced `DateFilter.tsx` from 247 to ~155 lines and eliminated several classes of state-sync bugs.

### Step 1: Replace the custom picker with the default shadcn Calendar

The existing `<Calendar>` component already supports `mode="range"` — no new package needed. Remove the text inputs, year-nav arrows, and Apply button. Let immediate commit replace the deferred-commit pattern:

```tsx
<Calendar
  mode="range"
  selected={calendarSelected}
  onSelect={handleRangeSelect}
  captionLayout="dropdown"
  month={month}
  onMonthChange={handleMonthChange}
  startMonth={dataBounds ? parseISO(dataBounds.minDate) : undefined}
  endMonth={dataBounds ? parseISO(dataBounds.maxDate) : undefined}
/>
```

`captionLayout="dropdown"` replaces the custom year-nav arrows with DayPicker's built-in month/year dropdowns. `startMonth`/`endMonth` bound the dropdown to actual data dates.

### Step 2: Fix DayPicker v9 single-click behavior

DayPicker v9 changed range mode: a single click immediately sets `from === to` (a zero-length range), which would trigger `doCommit` on the first click and close the popover. Intercept this case and treat it as start-only:

```ts
function handleRangeSelect(range: DateRange | undefined) {
  // DayPicker v9 sets from === to on first click; treat that as start-only
  if (range?.from && range?.to && range.from.getTime() === range.to.getTime()) {
    setPendingRange({ from: range.from, to: undefined })
    return
  }
  setPendingRange(range)
  if (range?.from && range?.to) {
    const committed = doCommit(range.from, range.to)
    if (committed) {
      setPendingRange(undefined)
      setOpen(false)
    }
  }
}
```

### Step 3: Control the month state to fix dropdown navigation

Without controlled month state, using a year/month dropdown fires DayPicker's internal navigation in a way that can corrupt the pending range selection. Add `month`/`setMonth` state and wire it to `onMonthChange`:

```ts
const [month, setMonth] = useState<Date>(() => new Date())
```

When the popover opens with an existing committed range, seed `month` to the range start so the calendar opens at the right place:

```ts
function handleOpenChange(next: boolean) {
  if (next && selectedRange) setMonth(parseISO(selectedRange.startDate))
  if (!next) setPendingRange(undefined)
  setOpen(next)
}
```

### Step 4: Skip the query when no date filter is active

When `dateFilter.type === 'none'`, skip the GraphQL query and force `displayData` to `undefined` so the map clears immediately (rather than showing stale `previousData`):

```ts
const noDateFilter = filterState.dateFilter.type === 'none'

const { data, previousData, error, loading } = useQuery<GetCrashesQuery>(GET_CRASHES, {
  variables: { filter: queryFilter, limit: 5000 },
  notifyOnNetworkStatusChange: true,
  skip: noDateFilter,
})

const displayData = noDateFilter ? undefined : (data ?? previousData)
```

### Step 5: Add a persistent warning banner

Rather than a transient toast, render a conditional banner absolutely positioned at the top-center of the map in `AppShell.tsx`:

```tsx
{
  filterState.dateFilter.type === 'none' && (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
      <div className="rounded-full bg-background/90 border px-4 py-1.5 text-sm font-medium shadow-sm dark:bg-zinc-900/90 dark:border-zinc-700 flex items-center gap-2">
        <TriangleAlert className="size-4 text-yellow-600 dark:text-yellow-400" />
        No dates selected — use the filters to select a date range
      </div>
    </div>
  )
}
```

`pointer-events-none` ensures the banner doesn't block map interactions.

---

## Date Filter — Named Preset Buttons

Instead of hardcoded year buttons (2025, 2024, …), the date filter now uses four dynamic named presets that always reflect the actual available data.

### Why presets instead of years?

Year buttons have two problems: they go stale (2025 becomes less useful once 2026 data exists), and they require a manual update with every new data import. Named presets like "YTD" or "90 Days" are always relevant and anchor to `dataBounds.maxDate` — the latest date actually in the database — so they never return empty results for dates after the last import.

### Step 1: Add `DatePreset` type and utility to `FilterContext`

Add the type and a shared utility that computes concrete date ranges from a preset name + data bounds:

```ts
// context/FilterContext.tsx
export type DatePreset = 'ytd' | '90d' | 'last-year' | '3y'

export type DateFilter =
  | { type: 'none' }
  | { type: 'year'; year: number }
  | { type: 'range'; startDate: string; endDate: string }
  | { type: 'preset'; preset: DatePreset } // ← new

export const PRESET_LABELS: Record<DatePreset, string> = {
  ytd: 'YTD',
  '90d': '90 Days',
  'last-year': 'Last Year',
  '3y': '3 Years',
}

export function presetToDateRange(
  preset: DatePreset,
  dataBounds: { minDate: string; maxDate: string }
): { startDate: string; endDate: string } {
  const maxDate = parseISO(dataBounds.maxDate)
  const today = new Date()
  switch (preset) {
    case 'ytd':
      return { startDate: format(startOfYear(today), 'yyyy-MM-dd'), endDate: dataBounds.maxDate }
    case '90d':
      return { startDate: format(subDays(maxDate, 90), 'yyyy-MM-dd'), endDate: dataBounds.maxDate }
    case 'last-year': {
      const lastYear = subYears(today, 1)
      return {
        startDate: format(startOfYear(lastYear), 'yyyy-MM-dd'),
        endDate: format(endOfYear(lastYear), 'yyyy-MM-dd'),
      }
    }
    case '3y':
      return {
        startDate: format(subMonths(maxDate, 36), 'yyyy-MM-dd'),
        endDate: dataBounds.maxDate,
      }
  }
}
```

Key design decisions:

- YTD, 90 Days, and 3 Years use `dataBounds.maxDate` as their end anchor — not `today`. This ensures no empty tail if data lags behind the current date.
- Last Year uses the previous full calendar year, which is independent of `dataBounds`.
- `presetToDateRange` is exported so it can be shared between `toCrashFilter` (for query variables) and `DateFilter` (for display labels) without duplicating the computation logic.

Also add a `SET_DATE_PRESET` action and update `toCrashFilter` to resolve presets:

```ts
// In toCrashFilter:
const dateVars = (() => {
  const { dateFilter, dataBounds } = filterState
  if (dateFilter.type === 'year') return { year: dateFilter.year }
  if (dateFilter.type === 'range')
    return { dateFrom: dateFilter.startDate, dateTo: dateFilter.endDate }
  if (dateFilter.type === 'preset' && dataBounds) {
    const { startDate, endDate } = presetToDateRange(dateFilter.preset, dataBounds)
    return { dateFrom: startDate, dateTo: endDate }
  }
  return {}
})()
```

If `dataBounds` hasn't loaded yet when a preset is active, `toCrashFilter` returns no date variables — but the query will be skipped at the call site anyway (see Step 3).

Change the default filter to `ytd`:

```ts
const initialState: FilterState = {
  ...
  dateFilter: { type: 'preset', preset: 'ytd' },
  ...
}
```

### Step 2: Update URL encode/decode for presets

Presets are stored by name in the URL so the active button stays highlighted on page reload:

```ts
// Encode: ?date=90d, ?date=last-year, ?date=3y; ytd is the default so omit it
if (dateFilter.type === 'preset' && dateFilter.preset !== 'ytd') {
  params.set('date', dateFilter.preset)
}

// Decode: parse the four known preset values
const VALID_PRESETS = new Set(['ytd', '90d', 'last-year', '3y'])
if (rawDate !== null && VALID_PRESETS.has(rawDate)) {
  dateFilter = { type: 'preset', preset: rawDate as DatePreset }
}
```

Old `?year=2025` URLs still decode to `{ type: 'year', year: 2025 }` for backward compatibility — the data will still load; the button just won't highlight (year buttons no longer exist in the UI).

### Step 3: Skip the query until `dataBounds` loads

Presets need `dataBounds.maxDate` before they can compute a query range. Add a second skip condition in `CrashLayer`:

```ts
const noDateFilter = filterState.dateFilter.type === 'none'
const presetWithoutBounds =
  filterState.dateFilter.type === 'preset' && filterState.dataBounds === null
const skipQuery = noDateFilter || presetWithoutBounds

const { data, previousData } = useQuery(GET_CRASHES, { skip: skipQuery, ... })
const displayData = skipQuery ? undefined : (data ?? previousData)
```

This prevents the map from firing an unbounded query on initial render before the filter options query returns. In practice, `dataBounds` resolves quickly since `GET_FILTER_OPTIONS` is already fetched on app load for the cascading dropdowns.

### Step 4: Update `DateFilter.tsx`

Replace the year buttons loop with a preset buttons loop, and update the popover trigger label to show the computed date range when a preset is active:

```tsx
const QUICK_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'ytd', label: 'YTD' },
  { id: '90d', label: '90 Days' },
  { id: 'last-year', label: 'Last Year' },
  { id: '3y', label: '3 Years' },
]

// Resolve preset range for display (also used for calendarSelected seeding)
const activePresetRange =
  selectedPreset && dataBounds ? presetToDateRange(selectedPreset, dataBounds) : null

// Popover trigger label shows computed range when a preset is active
const rangeLabel = activePresetRange
  ? `${format(parseISO(activePresetRange.startDate), DATE_DISPLAY_FORMAT)} – ${format(parseISO(activePresetRange.endDate), DATE_DISPLAY_FORMAT)}`
  : selectedRange
    ? `${format(parseISO(selectedRange.startDate), DATE_DISPLAY_FORMAT)} – ...`
    : 'Custom range…'
```

The calendar also pre-populates with the computed range when a preset is active, so opening the popover shows the user what dates are currently selected:

```ts
const calendarSelected: DateRange | undefined =
  pendingRange ??
  (activePresetRange
    ? { from: parseISO(activePresetRange.startDate), to: parseISO(activePresetRange.endDate) }
    : selectedRange ? { from: ..., to: ... } : undefined)
```

When the popover opens, seed `month` to the start of the active preset range so the calendar doesn't jump to today:

```ts
function handleOpenChange(next: boolean) {
  if (next) {
    if (activePresetRange) {
      setMonth(parseISO(activePresetRange.startDate))
    } else if (selectedRange) {
      setMonth(parseISO(selectedRange.startDate))
    }
  }
  if (!next) setPendingRange(undefined)
  setOpen(next)
}
```

Clicking an active preset button toggles it off (dispatches `CLEAR_DATE`), consistent with the old year button behavior.

---

## Phase 6: Continued

### Step 1: Popup Centering with Mapbox Padding

When a crash is clicked, the map flies to center on the crash coordinates. But since the popup anchors at the bottom of the crash point and renders upward, it can overlap the UI buttons at the top of the screen — especially on mobile.

The fix is Mapbox's `padding` option in `flyTo`. Padding defines a "safe zone" inset from the viewport edges; the `center` coordinate is placed at the center of the remaining area rather than the full viewport center. Setting `padding: { top: 200 }` shifts the crash point ~100px below the visual center, giving the popup room to extend upward.

```ts
const isMobile = window.innerWidth < 768
const padding = isMobile
  ? { top: 200, bottom: 70, left: 0, right: 0 }
  : { top: 150, bottom: 0, left: 0, right: 0 }

map.flyTo({ center: coords, zoom: targetZoom, pitch: 45, padding, duration: 800 })
```

The `bottom: 70` on mobile accounts for the fixed SummaryBar strip at the bottom of the viewport (~44px + buffer). When the popup closes and the viewport is restored, padding must be explicitly reset to `{ top: 0, bottom: 0, left: 0, right: 0 }` — Mapbox retains the padding state across `flyTo` calls.

### Step 2: Metered Zoom

Jumping straight to zoom 15.5 on every crash click is jarring when the user starts from a state-level view (zoom 7–10). A better UX is to fly halfway to the target zoom, so the user lands at a contextually appropriate level and can click again to go deeper if needed.

The implementation: save the pre-click zoom in `savedViewportRef`, then compute the midpoint:

```ts
const TARGET_ZOOM = 15.5
const newZoom = (savedViewportRef.current!.zoom + TARGET_ZOOM) / 2
map.flyTo({ center: coords, zoom: newZoom, ... })
```

For crash-to-crash clicks (clicking a new crash without closing the popup), `savedViewportRef` is NOT updated — it retains the original pre-popup zoom. This keeps the depth consistent: every crash click from a given starting position lands at the same zoom level, regardless of how many crashes the user has clicked through.

### Step 3: Retaining User Camera Moves During Popup

If the user pans or zooms while a popup is open, the saved viewport should update so that dismissing the popup returns to their new position rather than the original one.

The challenge: Mapbox fires the same `moveend` event for both user gestures and programmatic `flyTo` animations. Naively updating `savedViewportRef` on every `moveend` would overwrite the correct saved position with the zoomed-in popup position.

The fix is a `flyingRef` boolean flag. Set it to `true` immediately before each `flyTo` and clear it after `duration + 100ms`:

```ts
flyingRef.current = true
setTimeout(() => { flyingRef.current = false }, 900)
map.flyTo({ ... duration: 800 ... })
```

The `onMoveEnd` handler then only saves when `flyingRef.current` is `false`:

```ts
const handleMoveEnd = useCallback(() => {
  if (flyingRef.current || !savedViewportRef.current) return
  const map = internalMapRef.current?.getMap()
  if (!map) return
  const center = map.getCenter()
  savedViewportRef.current = {
    center: [center.lng, center.lat],
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  }
}, [])
```

Both `flyTo` call sites (popup open and popup close) must set the flag — missing either one causes the saved viewport to get corrupted by the animation's `moveend` event.

### Step 4: Tilt Toggle and Zoom Buttons

Standard map controls (zoom in/out, tilt toggle) live in `AppShell` at `absolute bottom-14 left-4 md:bottom-6` — above the fixed mobile SummaryBar. They use the same shadcn `Button` `variant="outline"` styling as all other floating controls.

The tilt button reads the map's actual current pitch at click time (not a stale state variable) so it stays accurate even if a popup animation changed the pitch in the meantime:

```tsx
onClick={() => {
  const map = mapRef.current?.getMap()
  if (!map) return
  const isTilted = map.getPitch() > 0
  map.easeTo({ pitch: isTilted ? 0 : 45, duration: 500 })
  setTilted(!isTilted)
}}
```

The `tilted` state is local to `AppShell` — it only drives the button's `variant` (`"default"` when active, `"outline"` when flat). `map.zoomIn()` / `map.zoomOut()` are built-in Mapbox GL JS methods that animate one zoom level at a time with easing.

---

## Display Limit & Warning Toast

### Why cap the query?

Loading tens of thousands of GeoJSON features into the browser is expensive. We set a hard cap and show a persistent toast when the user's filters exceed it, prompting them to narrow their search.

The cap started at 5,000, was raised to 10,000, and then raised again to **40,000** after confirming acceptable browser performance with the full ~34,000-row Washington dataset. At this limit the toast effectively never fires for the current data, but remains in place as a safety net if the dataset grows.

### Raising the resolver cap

In `lib/graphql/resolvers.ts`, the `crashes` query has a server-side hard cap:

```ts
const cappedLimit = Math.min(limit ?? 1000, 40000)
```

The `totalCount` is always returned (via a parallel `prisma.crashData.count({ where })`), so the client always knows the true total even when results are truncated.

### Frontend query limit

In `components/map/CrashLayer.tsx`, a module-level constant keeps the limit in one place:

```ts
const DISPLAY_LIMIT = 40_000
const LIMIT_TOAST_ID = 'crash-limit-warning'
```

The query uses it directly: `variables: { filter: queryFilter, limit: DISPLAY_LIMIT }`.

### Toast logic

A `useEffect` watches `data` and `skipQuery`. When fresh data arrives and `totalCount > DISPLAY_LIMIT`, it fires a persistent Sonner toast with a stable ID so it upserts rather than stacking:

```ts
useEffect(() => {
  if (!data || skipQuery) {
    toast.dismiss(LIMIT_TOAST_ID)
    return
  }
  const { totalCount } = data.crashes
  if (totalCount > DISPLAY_LIMIT) {
    toast.warning(
      `Showing ${DISPLAY_LIMIT.toLocaleString()} of ${totalCount.toLocaleString()} crashes — narrow your filters to see all results.`,
      { id: LIMIT_TOAST_ID, duration: Infinity }
    )
  } else {
    toast.dismiss(LIMIT_TOAST_ID)
  }
}, [data, skipQuery])
```

`duration: Infinity` keeps it visible until the user either dismisses it manually or narrows their filters below the limit (which triggers `toast.dismiss`).

### Toast positioning — a Sonner v2 gotcha

Sonner v2 has two separate CSS variable systems: `--offset-*` for desktop and `--mobile-offset-*` for screens ≤600px. The `offset` prop only sets `--offset-*` — it has **no effect on mobile**. To control the mobile position, use the dedicated `mobileOffset` prop:

```tsx
<Sonner
  position="top-center"
  offset={32}
  mobileOffset={{ top: 80, right: 16, left: 16, bottom: 16 }}
/>
```

On mobile, Sonner's built-in `@media (max-width:600px)` stylesheet forces the toaster to be full-width and uses `--mobile-offset-top` for the vertical position. `top: 80` clears the app's `top-4` + `h-9` button row (≈52px) with comfortable breathing room.

---

## Phase 7: Data Ingestion Pipeline

So far CrashMap has been querying the same data that was loaded manually into the database before development started. For the app to stay current, we need a repeatable way to pull new crash data from the source and insert it into the database. This phase covers building that pipeline and running the initial full backfill.

### Step 1: Understanding the Data Source

Washington State crash data is published through the WSDOT collision data portal. The portal exposes a public REST API that returns data as a single-line, double-encoded JSON string — it's not directly usable by a standard HTTP client without pre-processing.

The endpoint pattern is:

```text
GET https://remoteapps.wsdot.wa.gov/highwaysafety/collision/data/portal/public/
    CrashDataPortalService.svc/REST/GetPublicPortalData
    ?rptCategory=Pedestrians%20and%20Pedacyclists
    &rptName=Pedestrians%20by%20Injury%20Type
    &reportStartDate=20250101
    &reportEndDate=20251231
```

Two report names exist — one per mode:

- `"Pedestrians by Injury Type"` for pedestrian crashes
- `"Bicyclists by Injury Type"` for bicyclist crashes

The `Mode` field is **not included in the response** — the operator selects it before fetching. The pipeline stamps every record with the selected mode during SQL generation.

The response is a double-encoded JSON string wrapped in outer quotes:

```text
"\"[{\\\"ColliRptNum\\\":\\\"3838031\\\",\\\"Jurisdiction\\\":\\\"City Street\\\", ...}]\""
```

After decoding, each record looks like:

```json
{
  "ColliRptNum": "3838031",
  "Jurisdiction": "City Street",
  "CountyName": "King",
  "CityName": "Seattle",
  "FullDate": "2025-02-21T00:00:00",
  "FullTime": "11:06 AM",
  "MostSevereInjuryType": "Suspected Minor Injury",
  "AgeGroup": "",
  "InvolvedPersons": 4,
  "CrashStatePlaneX": 1192299.06,
  "CrashStatePlaneY": 837515.73,
  "Latitude": 47.615677169795,
  "Longitude": -122.316864546986
}
```

### Step 2: Pipeline Architecture

Rather than scraping the portal's web UI, we call the API directly from a Flask backend and generate a `.sql` file the operator runs manually against the Render database. This keeps the pipeline stateless — no database credentials touch the pipeline at all.

The design philosophy:

- **Stateless** — output is a portable `.sql` file; no DB connection in the pipeline
- **Server-side fetching** — the backend calls WSDOT directly; no browser copy-paste
- **Non-destructive** — all inserts use `ON CONFLICT DO NOTHING`; re-importing is always safe
- **Minimal dependencies** — SQL generation uses only Python's standard library; only `requests` is added

The full flow:

```text
WSDOT REST API
      │  HTTP GET (from Flask backend)
      ▼
┌─────────────────────────────┐
│   CrashMap Data Pipeline    │
│                             │
│   React Frontend (Vite)     │  ← date range + mode UI
│      + Flask Backend        │  ← fetches WSDOT, generates SQL
└──────────────┬──────────────┘
               │ .sql file download
               ▼
    Operator runs via psql
               │
               ▼
┌──────────────────────────────┐
│  CrashMap PostgreSQL + PostGIS│
│  crashdata table (Render)    │
└──────────────────────────────┘
               │
               ▼
    REFRESH MATERIALIZED VIEW
               │
               ▼
    CrashMap app (crashmap.io)
    reflects new records
```

The pipeline lives in a separate repo ([esri-exporter](https://github.com/nickmagruder/esri-exporter)), originally built as a general ESRI/WSDOT data exporter and refactored into a purpose-built CrashMap data pipeline.

### Step 3: The Flask Backend

The backend is a single `app.py` file. The core is a `generate_sql()` function that maps WSDOT fields to CrashMap's schema and produces batched `INSERT` statements.

**Primary endpoint — `POST /api/fetch-and-generate-sql`:**

```python
@app.route('/api/fetch-and-generate-sql', methods=['POST'])
def fetch_and_generate_sql():
    data = request.get_json()
    mode = data.get('mode')
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    batch_size = int(data.get('batch_size', 500))

    # Build WSDOT URL
    rpt_name = 'Pedestrians by Injury Type' if mode == 'Pedestrian' else 'Bicyclists by Injury Type'
    url = (
        'https://remoteapps.wsdot.wa.gov/highwaysafety/collision/data/portal/public/'
        'CrashDataPortalService.svc/REST/GetPublicPortalData'
        f'?rptCategory=Pedestrians%20and%20Pedacyclists'
        f'&rptName={requests.utils.quote(rpt_name)}'
        f'&locationType=&locationName=&jurisdiction='
        f'&reportStartDate={start_date}&reportEndDate={end_date}'
    )

    response = requests.get(url, timeout=120)
    records = fix_malformed_json(response.text)
    sql = generate_sql(records, mode, batch_size)

    return Response(
        sql,
        mimetype='text/plain',
        headers={'Content-Disposition': f'attachment; filename="crashmap_{mode.lower()}_{start_date}_{end_date}.sql"'}
    )
```

**`generate_sql()` — field mapping and SQL generation:**

The function maps WSDOT source fields to CrashMap's PascalCase quoted column names. Key transformations:

| WSDOT Field          | CrashMap Column         | Notes                                             |
| -------------------- | ----------------------- | ------------------------------------------------- |
| `ColliRptNum`        | `"ColliRptNum"`         | Primary key                                       |
| _(not in WSDOT)_     | `"StateOrProvinceName"` | Hardcoded `'Washington'`                          |
| `RegionName`         | `"RegionName"`          | `'` placeholder → `NULL`                          |
| `FullDate`           | `"FullDate"`            | ISO 8601 text, direct map                         |
| `FullDate` (parsed)  | `"CrashDate"`           | Date portion only: `2025-02-21`                   |
| `AgeGroup`           | `"AgeGroup"`            | Empty string → `NULL`                             |
| _(UI-selected)_      | `"Mode"`                | Stamped per export                                |
| `CrashStatePlaneX/Y` | _(dropped)_             | Not used; CrashMap uses Lat/Long + PostGIS        |
| _(generated by DB)_  | `"geom"`                | **Not inserted** — PostGIS generates from Lat/Lng |

The `"geom"` column is a PostgreSQL generated column defined as:

```sql
GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("Longitude", "Latitude"), 4326)) STORED
```

**Never include `"geom"` in INSERT statements** — PostgreSQL raises `ERROR: cannot insert a non-DEFAULT value into column "geom"` if you try.

The generated SQL looks like this:

```sql
-- CrashMap Data Import
-- Mode: Pedestrian
-- Generated: 2026-02-24
-- Records: 7

INSERT INTO crashdata (
  "ColliRptNum", "Jurisdiction", "StateOrProvinceName", "RegionName",
  "CountyName", "CityName", "FullDate", "CrashDate", "FullTime",
  "MostSevereInjuryType", "AgeGroup", "InvolvedPersons",
  "Latitude", "Longitude", "Mode"
) VALUES
  ('3838031', 'City Street', 'Washington', NULL, 'King', 'Seattle',
   '2025-02-21T00:00:00', '2025-02-21', '11:06 AM', 'Suspected Minor Injury',
   NULL, 4, 47.615677169795, -122.316864546986, 'Pedestrian')
ON CONFLICT ("ColliRptNum") DO NOTHING;
```

Records are batched 500 rows per INSERT to avoid hitting PostgreSQL's parameter limit.

**Fallback endpoint — `POST /api/generate-sql`:**

For cases where direct WSDOT API access is unavailable (network restrictions, testing), a fallback endpoint accepts the raw JSON pasted or uploaded from the browser DevTools Network tab. The same `generate_sql()` function handles both paths.

### Step 4: The React Frontend

The frontend is a minimal Vite + React + TypeScript app. A single `form.component.tsx` component handles the entire UI: Mode dropdown, Start/End date inputs, and a single button that fires the fetch-and-download request.

TanStack Query's `useMutation` manages the async lifecycle:

```tsx
const mutation = useMutation({
  mutationFn: async (params: FetchParams) => {
    const res = await fetch('/api/fetch-and-generate-sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.blob()
  },
  onSuccess: (blob, params) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `crashmap_${params.mode.toLowerCase()}_${params.start_date}_${params.end_date}.sql`
    a.click()
    URL.revokeObjectURL(url)
  },
})
```

Vite's dev proxy forwards `/api/*` requests to the Flask backend running on port 5000, so the frontend and backend can run independently in development.

### Step 5: Prepare the Database for the Backfill

Before the initial bulk import, two unused columns need to be removed from the `crashdata` table. The original schema (introspected from the WSDOT source format) included `CrashStatePlaneX` and `CrashStatePlaneY` — Washington State Plane coordinates. CrashMap uses only `Latitude`, `Longitude`, and the PostGIS `geom` column, so these can be dropped.

Run in pgAdmin (or any SQL client connected to the Render database):

```sql
ALTER TABLE crashdata
  DROP COLUMN "CrashStatePlaneX",
  DROP COLUMN "CrashStatePlaneY";
```

Then clear the existing data for a clean full-backfill:

```sql
TRUNCATE TABLE crashdata;
```

`TRUNCATE` is faster than `DELETE FROM` for a full clear and preserves the table structure, constraints, and indexes.

**Update the Prisma schema to match.** If you don't remove these from `prisma/schema.prisma`, every query will fail with "column does not exist":

In `prisma/schema.prisma`, remove these two lines from the `CrashData` model:

```prisma
crashStatePlaneX     Float?   @map("CrashStatePlaneX") @db.Real
crashStatePlaneY     Float?   @map("CrashStatePlaneY") @db.Real
```

Regenerate the client:

```bash
npx prisma generate
```

Push to `main` to trigger a Render redeploy. No `prisma migrate` is needed — the DB change was applied manually.

### Step 6: Run the Initial Backfill

With the database prepared and the pipeline deployed, run the 10-year backfill. The WSDOT API goes back approximately 10 years.

**Always import Pedestrian data first, then Bicyclist.** Some crashes appear in both reports (e.g., a car hits a cyclist who was walking their bike). Both records have the same `ColliRptNum`. The pipeline uses `ON CONFLICT DO NOTHING`, so the first import wins. Pedestrian is the canonical record for shared crashes.

For each year (or multi-year range):

1. Open the pipeline app
2. Set Mode = `Pedestrian`, set date range (e.g., `20150101` – `20151231`)
3. Click **Fetch from WSDOT & Download SQL** — the `.sql` file downloads automatically
4. Run it: `psql "$DATABASE_URL" -f crashmap_pedestrian_20150101_20151231.sql`
5. Repeat with Mode = `Bicyclist` for the same date range

After all years are imported, refresh the materialized views:

```sql
REFRESH MATERIALIZED VIEW filter_metadata;
REFRESH MATERIALIZED VIEW available_years;
```

**Initial backfill results (2015–2026):**

| Mode         | Total records |
| ------------ | ------------- |
| Pedestrian   | 22,419        |
| Bicyclist    | 13,213        |
| **Combined** | **35,632**    |

### Step 7: Validate the Import

Run these checks after any import to confirm it completed correctly:

```sql
-- Record counts by mode and year
SELECT "Mode", EXTRACT(YEAR FROM "CrashDate") AS year, COUNT(*)
FROM crashdata
GROUP BY "Mode", year
ORDER BY year DESC, "Mode";

-- Null checks on required fields (all should return 0)
SELECT COUNT(*) FROM crashdata WHERE "ColliRptNum" IS NULL;
SELECT COUNT(*) FROM crashdata WHERE "Latitude" IS NULL OR "Longitude" IS NULL;
SELECT COUNT(*) FROM crashdata WHERE "CrashDate" IS NULL;
SELECT COUNT(*) FROM crashdata WHERE "Mode" IS NULL;

-- PostGIS geometry check (should return 0)
SELECT COUNT(*) FROM crashdata WHERE geom IS NULL;
```

Then open CrashMap and confirm:

- New records appear as dots on the map
- Year filter includes newly imported years
- County and city filters include newly imported locations

### What We Have

At the end of Phase 8, CrashMap has a complete data ingestion pipeline:

- A Flask + React/Vite app ([esri-exporter](https://github.com/nickmagruder/esri-exporter)) that calls the WSDOT API directly, converts the double-encoded JSON response to batched SQL, and streams a `.sql` file download — no database credentials in the pipeline
- A clean 16-column `crashdata` schema with the unused `CrashStatePlaneX/Y` columns removed
- 35,632 crash records spanning 2015–2026 loaded into the production database
- A repeatable monthly import workflow documented in `data-pipeline.md`

For the full operator workflow (routine monthly imports, troubleshooting, validation checklist), see [data-pipeline.md](data-pipeline.md).

---

_This tutorial is a work in progress. More steps will be added as the project progresses._
