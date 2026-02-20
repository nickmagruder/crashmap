# Building CrashMap: A Full-Stack Crash Data Visualization Map

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
- **Triggers on all branches** so you get feedback on feature branches, not just PRs

#### Enable branch protection on GitHub

In your repo settings → Branches → Add rule for `main`:

- ✅ Require status checks to pass before merging
- ✅ Select the `check` job from the CI workflow
- ✅ Require branches to be up to date before merging

This makes the CI gate mandatory — no merges to `main` without a green build.

---

## Phase 2: API Layer

### Step 17: Install Apollo Server

Phase 2 focuses on the GraphQL API. We're using [Apollo Server](https://www.apollographql.com/docs/apollo-server/) integrated into a Next.js App Router route handler.

**Why Apollo Server?**

Apollo Server is the most widely-used GraphQL server for JavaScript, with first-class TypeScript support, a built-in sandbox (Apollo Studio Explorer), and a mature ecosystem. For App Router specifically, Apollo Server does not ship a built-in Next.js integration — instead, there's a community-maintained package in the official `apollo-server-integrations` GitHub organization: `@as-integrations/next`.

> **Note:** The Apollo blog post "Next.js — Getting Started" covers the **Pages Router** only. For App Router, `@as-integrations/next` is the correct integration. The `startServerAndCreateNextHandler` function wraps Apollo Server into a standard Next.js route handler that works with both GET and POST.

**Packages:**

- `@apollo/server` — the Apollo Server v4 core
- `graphql` — the GraphQL.js peer dependency (required by Apollo Server)
- `@as-integrations/next` — bridges Apollo Server with Next.js App Router route handlers

```bash
npm install @apollo/server graphql @as-integrations/next
```

### Step 18: Create the GraphQL Route Handler

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

### Step 19: Prisma Singleton and the Prisma 7 Driver Adapter

Before writing resolvers, we need a `PrismaClient` instance. In Next.js, the dev server uses hot module replacement — if you create a new `PrismaClient` on every hot reload you'll exhaust the database connection pool. The solution is a module-level singleton stored on `globalThis`.

**Prisma 7 gotcha — driver adapter required:**

The new `provider = "prisma-client"` generator in Prisma 7 no longer reads `DATABASE_URL` from the environment automatically. Instead, it requires an explicit driver adapter passed to the constructor. For a PostgreSQL connection, that's `@prisma/adapter-pg`:

```bash
npm install @prisma/adapter-pg
```

**`lib/prisma.ts`:**

```typescript
import { PrismaClient } from '@/lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

function createPrismaClient() {
  const adapter = new PrismaPg(process.env.DATABASE_URL!)
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

### Step 20: Implement GraphQL Resolvers

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
  state: (p) => p.stateOrProvinceName,
  county: (p) => p.countyName,
  severity: (p) => rawToBucket(p.mostSevereInjuryType),
  crashDate: (p) => p.crashDate?.toISOString().slice(0, 10) ?? null,
  // ... etc
}
```

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
  // ... cities, years similarly
  severities: () => ['Death', 'Major Injury', 'Minor Injury', 'None'],
  modes: () => ['Bicyclist', 'Pedestrian'],
}
```

Prisma's tagged template `$queryRaw` automatically parameterizes interpolated values, so `WHERE state = ${state}` is safe from SQL injection. The `severities` and `modes` resolvers return static arrays — no DB call needed.

---

## Step N: GraphQL Codegen — End-to-End TypeScript Types

With the schema and resolvers in place, the next step is **automatic TypeScript type generation**. `graphql-codegen` reads your GraphQL schema and produces a `types.ts` file with resolver signatures, input types, and return types — keeping TypeScript in sync with your schema automatically.

### Install packages

```bash
npm install --save-dev @graphql-codegen/cli @graphql-codegen/typescript @graphql-codegen/typescript-resolvers
```

- `@graphql-codegen/cli` — the codegen runner
- `@graphql-codegen/typescript` — generates base TypeScript types (scalars, inputs, object types)
- `@graphql-codegen/typescript-resolvers` — generates a `Resolvers` type covering every resolver function signature

### Add the `codegen` script

In `package.json`:

```json
"codegen": "graphql-codegen --config codegen.ts"
```

Run it manually after any schema change: `npm run codegen`.

### Create `codegen.ts`

```ts
import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  // CodeFileLoader picks up the named `typeDefs` export from the TypeScript file.
  schema: './lib/graphql/typeDefs.ts',
  generates: {
    'lib/graphql/__generated__/types.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
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

## Step N+1: Query Depth Limiting

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

## Step N+2: Offset-Based Pagination and Server-Side Limit Cap

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
const cappedLimit = Math.min(limit ?? 1000, 5000)
```

`Math.min(limit ?? 1000, 5000)` handles three cases:

- Caller omits `limit` → defaults to 1000 (the schema default)
- Caller passes a reasonable value → used as-is (up to 5000)
- Caller passes an excessive value → silently capped at 5000

No error is thrown — the cap is transparent. This is appropriate for a public read-only API where the caller just wants data; a hard error on an oversized `limit` would be unnecessarily strict.

For the CrashMap use case, the map loads the full filtered dataset client-side so Mapbox can render and filter it. With 1,315 rows today and a ceiling of 5,000, a single request at full scale fits comfortably within the cap.

---

## Step N+3: Resolver Integration Tests with Vitest

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
- Pagination capping (limit at 5000)
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

**`crashes` query** — 6 tests: items + totalCount returned, field resolvers map correctly, limit capped at 5000, default limit 1000, offset passed, severity filter forwarded to Prisma

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

With the test suite in place, adding a `Test` step to the CI workflow is straightforward — `npm run test` runs `vitest run`, which exits with a non-zero code on any failure. Because Prisma is fully mocked, CI requires no database connection. The final CI step order is: Lint → Format check → Type check → Test → Build.

---

---

## Phase 3: Frontend Core

### Step N+4: Set Up Apollo Client

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

### Step N+5: Smoke-Test Deployment to Render

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

The build command has three parts:

1. `npm ci` — clean install from `package-lock.json` (also runs `postinstall: prisma generate`)
2. `npm run build` — Next.js production build, outputs to `.next/standalone/`
3. Two `cp` commands — copy public assets into the standalone bundle (Next.js does not do this automatically)

#### Create `.env.example`

Always commit a `.env.example` alongside a gitignored `.env`. It documents exactly what env vars the project needs, making onboarding and Render dashboard setup unambiguous:

```bash
# PostgreSQL connection string — set in Render dashboard, never commit the real value
DATABASE_URL="postgresql://user:password@host/database"

# Mapbox public access token — get from mapbox.com/account/access-tokens
NEXT_PUBLIC_MAPBOX_TOKEN="pk.eyJ1IjoiLi4uIn0..."

# Absolute base URL of the deployed app — used by Apollo Client for SSR
# Local dev: http://localhost:3000
# Production: https://crashmap.io (or your .onrender.com URL until the domain is wired up)
NEXT_PUBLIC_APP_URL="https://crashmap.io"
```

> **Why `NEXT_PUBLIC_APP_URL`?** The RSC Apollo Client needs an absolute URL to call `/api/graphql` — server-side `fetch` has no concept of a relative origin. See Step N+4.

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

### Step N+6: Install shadcn/ui Components

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

### Step N+7: Install Map Dependencies

With the GraphQL API complete and Apollo Client wired up, Phase 3 begins: building the interactive map UI. The first step is installing the mapping libraries.

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

### Step N+8: Secure the Mapbox Access Token

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

### Step N+9: Build the Map Page

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

### Step N+10: Build the Desktop Sidebar

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

---

### Step N+11: Build the Mobile Filter Overlay

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

### Step N+12: Build the SummaryBar Component

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

### Step N+13: Set Mobile Default Zoom to Seattle

Out of the box, `MapContainer` opens to a view of all of Washington state (zoom 7) — good for desktop where you want to see the full dataset at a glance, but too zoomed out for a phone where the initial view should feel immediately useful.

The fix is straightforward: detect the viewport width at render time and pick one of two `initialViewState` objects.

#### Why read `window.innerWidth` directly?

`MapContainer` is already a `'use client'` component. Client components are never server-rendered in isolation — by the time this function runs in the browser, `window` is always defined. More importantly, `initialViewState` is only consumed **once on mount** by Mapbox; it is not reactive. There is no re-render to cause hydration drift, and no `useEffect` or `useState` is needed.

#### Update `components/map/MapContainer.tsx`

Define the two view states as module-level constants (keeping them out of the render function avoids re-creating plain objects on every render) and select between them:

```tsx
'use client'

import Map from 'react-map-gl/mapbox'

const DESKTOP_VIEW = { longitude: -120.5, latitude: 47.5, zoom: 7 }
const MOBILE_VIEW = { longitude: -122.3321, latitude: 47.6062, zoom: 11 }

export function MapContainer() {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const initialViewState = isMobile ? MOBILE_VIEW : DESKTOP_VIEW

  return (
    <Map
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={initialViewState}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/light-v11"
    />
  )
}
```

The `typeof window !== 'undefined'` guard is defensive boilerplate — it is not technically needed in a client component but communicates intent clearly and prevents any future accidental SSR.

The 768px breakpoint matches the `md` Tailwind breakpoint used throughout the project (`md:hidden`, `hidden md:block`) for consistent mobile/desktop splitting.

#### Test the mobile default zoom

Open the app at a mobile viewport width (<768px, e.g. iPhone in Chrome DevTools). The map should open centered on Seattle at street level rather than the full Washington state view. At desktop width, the view is unchanged.

---

### Step N+13: Wire map.resize() to Sidebar and Overlay Transitions

Whenever the sidebar or filter overlay opens or closes, the Mapbox canvas needs to be told about the size change. Without this, Mapbox holds onto its old canvas dimensions and the map can appear offset or mis-sized until the user interacts with it.

The solution involves two changes:

1. Expose the Mapbox `MapRef` from `MapContainer` via `forwardRef`
2. Call `mapRef.current?.resize()` in `AppShell` whenever sidebar or overlay state changes

#### Why `map.resize()`?

Mapbox GL JS renders into an HTML canvas. The canvas size is computed once on initialization and again whenever you explicitly call `map.resize()`. CSS changes to the surrounding layout (even animated ones) don't trigger Mapbox's internal resize logic — you have to call it manually.

The Sheet sidebar animates open/closed with a CSS transition (~300ms). Calling `resize()` immediately when state changes means Mapbox recomputes size before the animation finishes, which can cause a momentary glitch. A short `setTimeout` deferred past the animation duration fixes this.

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

### Step N+14: Light/Dark Mode with next-themes

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

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label="Toggle theme"
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="size-4 hidden dark:block" />
    </Button>
  )
}
```

`resolvedTheme` is the actual applied theme — `'light'` or `'dark'` — never `undefined` after the client hydrates. Using it in `onClick` means the button always toggles to the opposite of whatever is currently applied, even when `defaultTheme="system"`.

The Sun icon has `dark:hidden` (visible in light mode, hidden in dark). The Moon icon has `hidden dark:block` (hidden in light mode, visible in dark). Both classes are driven by the `dark` class on `<html>`, so the icons swap instantly with the theme — no React re-render needed for the icon itself.

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

Two expressions you'll use constantly:

- **`match`** — a switch statement on a feature property value
- **`interpolate`** — smoothly scale a value (like radius) as another value (like zoom level) changes

### Color and Opacity with `match`

The `circle-color` and `circle-opacity` paint properties use `match` to select a value based on the `severity` property stored in each GeoJSON feature:

```ts
'circle-color': [
  'match',
  ['get', 'severity'],     // read the 'severity' property from the feature
  'Death',        '#B71C1C',
  'Major Injury', '#F57C00',
  'Minor Injury', '#FDD835',
  'None',         '#C5E1A5',
  '#999999',               // fallback for any unrecognized value
],

'circle-opacity': [
  'match',
  ['get', 'severity'],
  'Death',        0.85,
  'Major Injury', 0.70,
  'Minor Injury', 0.55,
  'None',         0.50,
  0.65,
],
```

`['get', 'severity']` reads the feature's `severity` property. The pairs after it are `value, result` pairs, with the last argument as the fallback. This is the same structure as a JavaScript `switch` statement.

### Zoom-Scaled Radius with `interpolate` + `match`

The radius needs two levels of variation: it scales with zoom level (so circles grow as you zoom in), and it varies by severity at each zoom level (so Death is always larger than Minor Injury). This requires **nesting** a `match` expression inside an `interpolate`:

```ts
'circle-radius': [
  'interpolate', ['linear'], ['zoom'],
  5,  ['match', ['get', 'severity'], 'Death', 3,  'Major Injury', 2.5, 'Minor Injury', 2,  'None', 1.5, 2 ],
  10, ['match', ['get', 'severity'], 'Death', 8,  'Major Injury', 7,   'Minor Injury', 6,  'None', 5,   6 ],
  15, ['match', ['get', 'severity'], 'Death', 14, 'Major Injury', 12,  'Minor Injury', 10, 'None', 8,   10],
],
```

Reading this: at zoom 5, a Death circle has radius 3px; at zoom 10, it has radius 8px; at zoom 15, it has radius 14px. Between those zoom levels, Mapbox linearly interpolates the radius automatically. Minor Injury circles follow the same curve but at smaller sizes.

### Putting It Together in `CrashLayer`

The layer style is defined as a `LayerProps` object (typed from `react-map-gl/mapbox` — not `CircleLayer`, which doesn't exist there) and spread onto the `<Layer>` component:

```ts
import type { LayerProps } from 'react-map-gl/mapbox'

const circleLayer: LayerProps = {
  id: 'crashes-circles',
  type: 'circle',
  paint: {
    'circle-color': [ /* match expression */ ],
    'circle-opacity': [ /* match expression */ ],
    'circle-radius': [ /* interpolate + match */ ],
    'circle-stroke-width': 0,
  },
}

// In the component:
<Source id="crashes" type="geojson" data={geojson}>
  <Layer {...circleLayer} />
</Source>
```

The `severity` value in each feature's `properties` is the bucketed display value set during GeoJSON construction — the same `rawToBucket()` mapping applied by the GraphQL resolver, stored in the feature so Mapbox can use it without another round-trip.

### Result

At the state zoom level, only the largest clusters of dark-red Death circles are visible. Zooming into a city reveals the full spectrum — red fatalities, orange serious injuries, yellow minor ones. The visual hierarchy lets users immediately identify hotspots without reading any labels.

---

## Step N: Crash Detail Popup

With circles on the map, the next step is making them interactive. Clicking a circle should open a popup showing details about that crash: date, time, injury type, mode, location, and a link to the official collision report.

### How react-map-gl Layer Clicks Work

Mapbox GL JS handles click events at the map level, not the element level. To get feature data when a circle is clicked, you need to tell react-map-gl which layers are "interactive" (i.e., participate in click hit-testing):

```tsx
<Map
  interactiveLayerIds={['crashes-circles']}
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
  map.on('mouseenter', 'crashes-circles', enter)
  map.on('mouseleave', 'crashes-circles', leave)
  return () => {
    map.off('mouseenter', 'crashes-circles', enter)
    map.off('mouseleave', 'crashes-circles', leave)
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

## Phase 4: Interactive Filters

With the map rendering live crash data and the filter state context in place, the next phase is building the actual filter controls. Each filter gets its own shared component in `components/filters/` so it can be dropped into both the desktop sidebar and the mobile overlay without duplicating logic.

The filter controls we'll build, in order:

1. **Mode toggle** — Bicyclist / Pedestrian / All
2. **Severity checkboxes** — Death, Major Injury, Minor Injury; opt-in None/Unknown
3. **Year quick-select** — four buttons for the most recent years
4. **Date range picker** — custom start/end date via Calendar popover
5. **Geographic cascading dropdowns** — State → County → City

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
    <div className="space-y-2">
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
6. `getActiveFilterLabels(filterState)` returns `["Bicyclists"]`; `SummaryBar` renders it as a badge

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

#### Color Indicators

Each checkbox row includes a small colored dot that matches the circle color on the map, giving users an immediate visual connection between the filter and what they'll see:

```ts
const SEVERITY_COLORS: Record<SeverityBucket | 'None', string> = {
  Death: '#B71C1C',
  'Major Injury': '#E65100',
  'Minor Injury': '#F9A825',
  None: '#C5E1A5',
}
```

These are the same values defined in `CrashLayer.tsx` for the Mapbox `match` expression — if the map colors ever change, both places need updating.

#### Building SeverityFilter

Create `components/filters/SeverityFilter.tsx`:

```tsx
'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { useFilterContext, type SeverityBucket } from '@/context/FilterContext'

const SEVERITY_COLORS: Record<SeverityBucket | 'None', string> = {
  Death: '#B71C1C',
  'Major Injury': '#E65100',
  'Minor Injury': '#F9A825',
  None: '#C5E1A5',
}

const BUCKETS: SeverityBucket[] = ['Death', 'Major Injury', 'Minor Injury']

export function SeverityFilter() {
  const { filterState, dispatch } = useFilterContext()

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
              style={{ backgroundColor: SEVERITY_COLORS[bucket] }}
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
            style={{ backgroundColor: SEVERITY_COLORS['None'] }}
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

### Step N: Date Filter — Year Quick-Select and Custom Range Picker

The date filter lets users narrow crashes to a specific year with one click, or pick an arbitrary start/end date with a calendar. Both modes write to the same `dateFilter` slot in `FilterContext`, so selecting one always clears the other.

#### Year Quick-Select Buttons

`FilterContext` already has everything we need: `SET_DATE_YEAR`, `CLEAR_DATE`, and the `DateFilter` discriminated union type. The component just needs to compute the four most recent years and toggle state on click.

A key design choice: compute years at runtime from `new Date().getFullYear()` rather than hardcoding them. This means the buttons stay current year-over-year without any code change.

```tsx
const CURRENT_YEAR = new Date().getFullYear()
const QUICK_YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3, CURRENT_YEAR - 4]
```

Clicking the active year acts as a toggle — it deselects by dispatching `CLEAR_DATE`. Clicking any other year dispatches `SET_DATE_YEAR`. The active button uses the `default` variant; inactive buttons use `outline`.

```tsx
function handleYearClick(year: number) {
  if (selectedYear === year) {
    dispatch({ type: 'CLEAR_DATE' })
  } else {
    dispatch({ type: 'SET_DATE_YEAR', payload: year })
  }
}
```

#### Custom Range Picker — Popover + Calendar

For arbitrary date ranges we use the shadcn `Popover` with a `Calendar` inside. The Calendar from `react-day-picker` has a built-in `mode="range"` that handles the two-click selection pattern natively — you don't need to manage which end is being picked.

The tricky part is knowing when to commit. The `onSelect` callback fires after every click, with an incomplete `DateRange` (only `from` set) after the first click and a complete one (both `from` and `to`) after the second. We only dispatch to context when both are present, then close the popover:

```tsx
function handleRangeSelect(range: DateRange | undefined) {
  setPendingRange(range)
  if (range?.from && range?.to) {
    dispatch({
      type: 'SET_DATE_RANGE',
      payload: {
        startDate: format(range.from, 'yyyy-MM-dd'),
        endDate: format(range.to, 'yyyy-MM-dd'),
      },
    })
    setOpen(false)
  }
}
```

`pendingRange` is local state that tracks the in-progress selection. It lets the calendar render the intermediate state (one end highlighted) while keeping context clean until both ends are chosen. When the popover closes without completing a range, `pendingRange` resets to `undefined`.

#### Hydrating the Calendar from Stored Context

When the user reopens the popover after a range is committed, the calendar should reflect the current selection. The stored dates in context are ISO strings (`"2024-01-15"`), but the Calendar needs `Date` objects. We use `parseISO` from `date-fns` rather than `new Date(string)` to avoid timezone-midnight issues — `new Date("2024-01-15")` creates a UTC midnight date that can display as Jan 14 in negative-offset timezones:

```tsx
const calendarSelected: DateRange | undefined =
  pendingRange ??
  (selectedRange
    ? { from: parseISO(selectedRange.startDate), to: parseISO(selectedRange.endDate) }
    : undefined)
```

`pendingRange` takes priority over the committed range so that in-progress clicks update the calendar immediately.

#### "Clear dates" Footer

A "Clear dates" button inside the popover appears only when a range is committed. It dispatches `CLEAR_DATE`, resets `pendingRange`, and closes the popover — a single action that restores the filter to its default state.

#### Wiring DateFilter to Both Surfaces

Add `<DateFilter />` between `<ModeToggle />` and `<SeverityFilter />` in both `Sidebar` and `FilterOverlay`. The section heading is "Date" (not "Year") since it now covers two distinct input modes.

---

## Step N: Geographic Cascading Dropdowns (State → County → City)

The last filter dimension is geography. Users can narrow the map to a specific state, then a county within that state, then a city within that county. Each level is populated from the `filterOptions` GraphQL query — the same query that powers the years list — using the `filter_metadata` materialized view we created in Phase 1.

### Adding the Query Documents

Add three new query documents to `lib/graphql/queries.ts`. The first fetches states and years on component mount. The second and third fetch counties and cities lazily — they're only sent when the user has already selected a parent level.

```ts
export type GetFilterOptionsQuery = {
  filterOptions: {
    states: string[]
    years: number[]
  }
}

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

export const GET_FILTER_OPTIONS = gql`
  query GetFilterOptions {
    filterOptions {
      states
      years
    }
  }
`

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

Exporting the TypeScript result types alongside the query documents lets us pass them as type parameters to `useQuery<T>()` without repeating the shape at each call site.

### The GraphQL Schema Supports Field-Level Arguments

The `FilterOptions` type in our schema has field-level arguments for cascading:

```graphql
type FilterOptions {
  states: [String!]!
  counties(state: String): [String!]!
  cities(state: String, county: String): [String!]!
  years: [Int!]!
}
```

This means `GET_COUNTIES` and `GET_CITIES` are both `filterOptions` queries — just selecting different fields with different arguments. Apollo Client caches them separately by query name and variable hash, so they don't collide with `GET_FILTER_OPTIONS` or with each other.

### The GeographicFilter Component

Create `components/filters/GeographicFilter.tsx`. It fires three queries and wires their results to three shadcn `Select` dropdowns:

```tsx
'use client'

import { useQuery } from '@apollo/client/react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFilterContext } from '@/context/FilterContext'
import {
  GET_FILTER_OPTIONS,
  GET_COUNTIES,
  GET_CITIES,
  type GetFilterOptionsQuery,
  type GetCountiesQuery,
  type GetCitiesQuery,
} from '@/lib/graphql/queries'

const ALL = '__all__'

export function GeographicFilter() {
  const { filterState, dispatch } = useFilterContext()

  const { data: optionsData } = useQuery<GetFilterOptionsQuery>(GET_FILTER_OPTIONS)
  const { data: countiesData } = useQuery<GetCountiesQuery>(GET_COUNTIES, {
    variables: { state: filterState.state },
    skip: !filterState.state,
  })
  const { data: citiesData } = useQuery<GetCitiesQuery>(GET_CITIES, {
    variables: { state: filterState.state, county: filterState.county },
    skip: !filterState.county,
  })

  const states = optionsData?.filterOptions?.states ?? []
  const counties = countiesData?.filterOptions?.counties ?? []
  const cities = citiesData?.filterOptions?.cities ?? []

  // ...
}
```

A few design decisions worth noting:

**Sentinel value instead of empty string.** shadcn's `Select` component passes the selected item's `value` string to `onValueChange`. An empty string `""` is falsy and causes issues with the controlled-value logic. Instead, we use `'__all__'` as a sentinel to represent "no selection", then map it to `null` when dispatching to context.

**`skip` for lazy queries.** Apollo Client's `skip` option prevents a query from running until its preconditions are met. `GET_COUNTIES` skips until a state is selected; `GET_CITIES` skips until a county is selected. This avoids unnecessary network requests on initial load and keeps the query variables well-defined.

**Disabling downstream selects.** The county select is `disabled` when no state is selected or the counties list is empty (still loading). The city select follows the same pattern. This gives users clear affordances about the cascade — you must pick a state before counties become available.

**Cascading resets are free.** The `FilterContext` reducer already handles cascading: `SET_STATE` clears county and city; `SET_COUNTY` clears city. No extra logic needed in the component — dispatching to context is enough.

### Wiring to Both Surfaces

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

Both surfaces read from the same `FilterContext`, so selecting a state in the mobile overlay and then opening the desktop sidebar will show the same selection — and vice versa. Apollo Client deduplicates network requests, so `GET_FILTER_OPTIONS` only hits the server once regardless of how many `GeographicFilter` instances are mounted.

---

## Phase 4 (continued): Connecting Filters to the GraphQL Query

### How the Wiring Already Works

At this point you might wonder: do we need to do anything special to make filter changes trigger a new network request? The answer is no — Apollo Client handles it automatically.

`CrashLayer` reads from `FilterContext` and passes the converted filter to `useQuery`:

```tsx
const { filterState, dispatch } = useFilterContext()
const { data, loading } = useQuery<GetCrashesQuery>(GET_CRASHES, {
  variables: { filter: toCrashFilter(filterState), limit: 5000 },
})
```

Apollo Client performs a **deep equality comparison** on `variables` before each render. When `filterState` changes (a user picks a new year, county, severity, etc.), `toCrashFilter(filterState)` produces a different object, Apollo detects the change, and a new network request fires automatically. The old data stays visible on the map while the new request is in flight — no blank-flash.

The `totalCount` returned by the query feeds back into context via `SET_TOTAL_COUNT`, which `AppShell` reads to populate `SummaryBar`. All of this was already wired when `FilterContext` was first introduced. The only thing genuinely missing was **loading feedback** — the user had no way to know a refetch was happening.

### Adding a Loading Indicator

When filter variables change, Apollo's default behavior (`notifyOnNetworkStatusChange: false`) is to silently re-execute the query and update `data` when it completes. The component doesn't re-render during the wait. This means the SummaryBar shows the old count right up until the new result arrives — fine for fast responses, but confusing on slow connections.

We fix this by opting into network status notifications:

```tsx
// CrashLayer.tsx
const { data, loading } = useQuery<GetCrashesQuery>(GET_CRASHES, {
  variables: { filter: toCrashFilter(filterState), limit: 5000 },
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

Finally, `SummaryBar` accepts an `isLoading` prop and pulses the count text:

```tsx
// SummaryBar.tsx
interface SummaryBarProps {
  crashCount?: number | null
  activeFilters?: string[]
  isLoading?: boolean
}

export function SummaryBar({
  crashCount = null,
  activeFilters = [],
  isLoading = false,
}: SummaryBarProps) {
  const countLabel = crashCount === null ? '—' : crashCount.toLocaleString()
  return (
    <div className="...">
      <span
        className={`text-sm font-medium tabular-nums whitespace-nowrap${isLoading ? ' animate-pulse' : ''}`}
      >
        {countLabel} crashes
      </span>
      {/* ...badges... */}
    </div>
  )
}
```

`animate-pulse` is a Tailwind utility that fades the element's opacity in and out. It's subtle enough not to be distracting but immediately communicates "something is loading". `AppShell` passes `filterState.isLoading` to `SummaryBar`.

---

## Debugging: Browser Extension Hydration Mismatches

### The Problem

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

### The Fix

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

---

## Phase 4 (continued): Auto-Zoom on Geographic Filter Change

### Why Auto-Zoom?

Once geographic filters are wired to the query, users can select a state, county, or city and the crash data on the map updates — but the viewport doesn't move. The user has to manually pan and zoom to find their results, which defeats the purpose of a geographic filter. The map should follow the data.

### Design Decisions

Before writing any code, it's worth being precise about **when** auto-zoom should fire:

- ✅ State, county, or city filter changes → zoom to fit crashes
- ❌ Severity, mode, or date changes → do **not** zoom; the user may have panned and their viewport should be respected
- ❌ Geographic filter cleared back to null → do **not** zoom; no target to zoom to

This means we can't simply react to `data` changing. Every filter change causes a refetch and a `data` update, but we only want to zoom for geographic ones.

### The Two-Ref Pattern

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

// Effect 1: fired when state/county/city changes — just sets the flag
useEffect(() => {
  const { state, county, city } = filterState
  const prev = prevGeoRef.current
  const changed = state !== prev.state || county !== prev.county || city !== prev.city
  if (!changed) return
  prevGeoRef.current = { state, county, city }
  zoomPendingRef.current = !!(state || county || city)
}, [filterState.state, filterState.county, filterState.city]) // eslint-disable-line react-hooks/exhaustive-deps

// Effect 2: fired when data arrives — executes zoom if flag is set
useEffect(() => {
  if (loading || !zoomPendingRef.current || !map || !data?.crashes?.items?.length) return

  const points = data.crashes.items.filter((c) => c.latitude != null && c.longitude != null)
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
}, [data, loading, map])
```

Effect 1's dependency array lists the three geo filter fields individually (not the whole `filterState` object) so it only runs when geographic values change. The `eslint-disable` comment is needed because the rule sees `filterState` accessed inside the callback and expects the whole object in deps, but accessing the three subproperties inside the deps array is the correct pattern here.

Effect 2 uses `useRef` for `zoomPendingRef` rather than `useState` — we don't want setting the flag to trigger a re-render, we just want to store state across render cycles.

### Where This Lives

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

### Calculating Bounds Client-Side vs. Server-Side

An alternative approach would be to add a `crashBounds(filter)` GraphQL query that returns `{ minLat, minLng, maxLat, maxLng }` computed by the database. The database's min/max aggregation would scale to millions of rows trivially.

We chose client-side bounds instead because:

- The crash data (up to 5000 rows) is **already loaded** by the existing `GET_CRASHES` query
- Client-side min/max over 5000 points is instantaneous
- No new API surface, no schema changes, no extra network round-trip

If the dataset grows to hundreds of thousands of rows (and the query limit is raised accordingly), revisit this — the DB approach would then be more efficient.

### Edge Cases

| Situation                             | Behavior                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| 0 crashes match the geo filter        | No zoom — the guard clause exits early before touching the map                               |
| 1 crash matches                       | `flyTo` at zoom 13 — `fitBounds` on a single point would zoom to `maxZoom` (too close)       |
| Many crashes spread across a state    | `fitBounds` with 80px padding, capped at zoom 14 to avoid zooming in too far on sparse areas |
| Geo filter cleared to null            | Effect 1 sets `zoomPendingRef = false` — Effect 2 exits immediately                          |
| User pans away, then changes severity | Effect 1 doesn't fire (no geo change) — Effect 2 exits (flag is false)                       |

---

## Phase 4 (continued): Default Filter State

### Starting With Focused Data

When a user first opens CrashMap, presenting no crashes at all (empty map, filters cleared) is a poor experience. The application has a specific dataset — Washington state bicyclist and pedestrian crash data — so defaulting to that context makes more sense than requiring the user to select filters before anything appears.

The simplest way to set startup filters is to update `initialState` in `FilterContext.tsx`:

```ts
const initialState: FilterState = {
  mode: null, // All modes
  severity: DEFAULT_SEVERITY, // Death, Major, Minor
  includeNoInjury: false,
  dateFilter: { type: 'year', year: 2025 }, // Most recent full year
  state: 'Washington', // Dataset scope
  county: null,
  city: null,
  totalCount: null,
  isLoading: false,
}
```

Because `RESET` dispatches `return initialState`, resetting filters also returns to this focused view rather than a blank state. This is the right behavior — "reset" means "back to the default app view," not "clear everything."

The auto-zoom effect in `CrashLayer` also fires on initial load because `prevGeoRef` initializes to `{ state: null, ... }` while the initial filter state has `state: 'Washington'` — so Effect 1 sees a change, sets the pending flag, and Effect 2 zooms to Washington bounds once the first query resolves.

### Always Showing the Active Mode in SummaryBar

The SummaryBar displays filter badges so users know what they're looking at. Originally, no badge appeared when mode was `null` (All modes) since "All" was treated as the non-active default. But once Washington and 2025 became the default, the philosophy shifted: show the complete active filter state, not just non-default selections.

The fix is a one-line change in `getActiveFilterLabels`:

```ts
// Before: badge only when a specific mode is selected
if (filterState.mode) labels.push(filterState.mode + 's')

// After: badge always, using 'All modes' as the label for null
labels.push(filterState.mode ? filterState.mode + 's' : 'All modes')
```

This means the SummaryBar always shows exactly one mode badge — either `All modes`, `Bicyclists`, or `Pedestrians` — making the current filter state unambiguous at a glance.

---

## Phase 5: Security & Polish

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

## Phase 5: Security Headers and CORS

With rate limiting in place, the next layer of protection is HTTP security headers and CORS. These don't stop determined attackers making direct HTTP requests, but they do close off whole classes of browser-based vulnerabilities: clickjacking, MIME sniffing, cross-origin data theft, and injection via third-party scripts.

### Step 1: Understand what the app touches

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

### Step 2: Add security headers in `next.config.ts`

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
- **`connect-src https://*.mapbox.com https://events.mapbox.com`** — all Mapbox API requests (tiles, geocoding, telemetry). The wildcard subdomain covers `api.mapbox.com`, `events.mapbox.com` is separate.
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

### Step 3: Add CORS to the GraphQL route

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

### Step 4: Verify

Run `npm run build` to confirm TypeScript and the build both pass. Then start the dev server and open the browser DevTools Network tab — every HTML and API response should now carry the security headers. You can verify CSP enforcement by temporarily adding an inline script that tries to call `eval()` and observing the console error.

For CORS, use `curl` with an `Origin` header:

```bash
curl -s -I -X OPTIONS https://crashmap.onrender.com/api/graphql \
  -H 'Origin: https://crashmap.io' \
  -H 'Access-Control-Request-Method: POST'
```

The response should include `Access-Control-Allow-Origin: https://crashmap.io` and `Access-Control-Allow-Methods: GET, POST, OPTIONS`.

_This tutorial is a work in progress. More steps will be added as the project progresses._
