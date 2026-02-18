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

### Step N+6: Install Map Dependencies

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

### Step N+7: Secure the Mapbox Access Token

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

_This tutorial is a work in progress. More steps will be added as the project progresses._
