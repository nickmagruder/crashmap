# CrashMap Data Pipeline — Operator Tutorial

> This guide walks through the complete process of downloading crash data from the WSDOT
> portal, generating SQL with the CrashMap Data Pipeline, and importing it into CrashMap's
> database.

---

## Data Ingestion Log

A record of every data import run against CrashMap's production database.

| Date       | Scope                            | Mode       | Records       | Notes                                                       |
| ---------- | -------------------------------- | ---------- | ------------- | ----------------------------------------------------------- |
| 2026-02-24 | Initial backfill 2015–2026       | Pedestrian | 22,419        | Stage 0 run first: dropped StatePlane cols, truncated table |
| 2026-02-24 | Initial backfill 2015–2026       | Bicyclist  | 13,213        | After Pedestrian; ~1,000 cross-report dupes skipped         |
| 2026-03-08 | February 2026                    | Pedestrian | 43            | EG82570 (Kirkland) has NULL lat/lng — won't appear on map   |
| 2026-03-08 | February 2026                    | Bicyclist  | 8             | No cross-report duplicates                                  |
| 2026-11-17 | 2025-01-01–2026-11-17 (4 chunks) | Pedestrian | 3,820 fetched | 3,820 inserted or updated by guarded upsert                 |
| 2026-11-17 | 2025-01-01–2026-11-17 (4 chunks) | Bicyclist  | 2,323 fetched | 2,314 inserted or updated; 9 Pedestrian rows preserved      |

Combined total after initial backfill: 35,632 records
Combined total after February 2026 import: 35,683 records
Combined total after 2026-11-17 refresh: 38,386 records (net increase: 2,703)

### 2026-11-17 — Pre-import baseline

Captured read-only from the verified production Render database before the Phase 10.2
refresh. The table contained 35,683 rows, with `CrashDate` from 2015-01-01 through
2026-02-28. Before importing, created and verified
`public.crashdata_backup_20261117` with the same 35,683 rows and date range. It was
kept through Phase 10.3 validation and dropped after all checks passed.

**Monthly counts before and after the refresh (2025-01 onward):**

| Month   | Before | After |
| ------- | -----: | ----: |
| 2025-01 |    279 |   280 |
| 2025-02 |    197 |   199 |
| 2025-03 |    231 |   232 |
| 2025-04 |    248 |   248 |
| 2025-05 |    265 |   267 |
| 2025-06 |    274 |   275 |
| 2025-07 |    317 |   319 |
| 2025-08 |    305 |   309 |
| 2025-09 |    327 |   327 |
| 2025-10 |    325 |   333 |
| 2025-11 |    316 |   318 |
| 2025-12 |    269 |   316 |
| 2026-01 |     60 |   295 |
| 2026-02 |     51 |   240 |
| 2026-03 |      — |   233 |
| 2026-04 |      — |   300 |
| 2026-05 |      — |   311 |
| 2026-06 |      — |   320 |
| 2026-07 |      — |   329 |
| 2026-08 |      — |   292 |
| 2026-09 |      — |   304 |
| 2026-10 |      — |   102 |
| 2026-11 |      — |    18 |

**Counts by `MostSevereInjuryType` before and after (all dates):**

| Injury type              |     Before |      After |
| ------------------------ | ---------: | ---------: |
| Dead at Scene            |        741 |        783 |
| Dead on Arrival          |        110 |        122 |
| Died in Hospital         |        662 |        700 |
| No Apparent Injury       |      1,350 |      1,505 |
| Possible Injury          |     12,016 |     12,664 |
| Suspected Minor Injury   |     14,890 |     16,225 |
| Suspected Serious Injury |      5,781 |      6,245 |
| Unknown                  |        133 |        142 |
| **Total**                | **35,683** | **38,386** |

### Post-import comparison

The deployed guarded-upsert exporter returned 6,143 records; 6,134 were inserted or
updated, while 9 Bicyclist conflicts were kept as Pedestrian. Comparing against the
backup found 128 mode changes from Bicyclist to Pedestrian and none in the opposite
direction. Two existing records changed injury classification: one Unknown to No
Apparent Injury and one No Apparent Injury to Suspected Minor Injury; no existing
record changed to a death category.

February 2026 has 240 records (179 Pedestrian, 61 Bicyclist). A fresh February export
returned the same 240 distinct report numbers; every source record is present in the
database with the expected mode and mapped values. There are no cross-mode duplicates
or missing source IDs. January has 295 records. The plan's ~250+ February figure was an
estimate, not a completeness threshold; the source itself returns 240, so no additional
import or manual adjustment was made.

The final table has 24,162 Pedestrian and 14,224 Bicyclist records, with a latest
`CrashDate` of 2026-11-12. Both materialized views were refreshed (`filter_metadata`:
263 rows; `available_years`: 12 years, 2015–2026).

Required-field null checks, NULL `geom`, and invalid-geometry checks all returned
zero; the latest five records are within Washington. The rough bounding box flags 103
coordinates (95 were in the backup, 8 newly added), but all 103 fall inside the US
Census TIGERweb Washington state polygon (FIPS 53). The eight new records' mode, date,
county/city, and coordinates match the deployed WSDOT export exactly. Seven are coastal
points in Grays Harbor, Clallam, or Pacific County; the Blaine point is only slightly
north of the rough 49-degree limit and is inside the state polygon. These are bounding
box false positives, not import errors. After all checks passed, dropped only
`public.crashdata_backup_20261117` on 2026-11-17.

Boundary reference: [US Census TIGERweb State_County, Washington FIPS 53](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0).

---

## Overview

The full workflow has five stages, plus a one-time database preparation stage for initial setup:

0. **Database Preparation** _(initial setup only)_ — Drop unneeded columns, clear existing data, update Prisma schema
1. **Fetch** — The pipeline calls the WSDOT API directly; you select mode and date range in the UI
2. **Generate** — The pipeline converts the response to SQL and offers a `.sql` file download
3. **Import** — Run the `.sql` file against CrashMap's PostgreSQL database
4. **Refresh** — Refresh CrashMap's materialized views so new data appears in the app
5. **Validate** — Run data integrity checks to confirm the import is complete and correct

> **Important — always import Pedestrian data first, then Bicyclist.**
> Some crashes appear in both reports. The pipeline uses a guarded upsert: records with
> the same mode are updated, and a Pedestrian record may replace a Bicyclist record, but
> a Bicyclist record never overwrites Pedestrian data. Pedestrian remains canonical.

---

## Stage 0: Database Preparation (Initial Setup Only)

> **Skip this stage for routine monthly imports.** It is only needed when resetting the
> database for a full data replacement from scratch.

Before the initial bulk import, the CrashMap `crashdata` table must be prepared: unneeded
columns removed, existing data cleared, and the Prisma schema in the CrashMap repo updated
to match.

### 0.1 Inspect the current schema

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'crashdata'
ORDER BY ordinal_position;
```

Compare the output against the pipeline's field mapping (see `ARCHITECTURE.md` §3). Columns
not in the mapping table are candidates for removal.

### 0.2 Drop unneeded columns

The WSDOT source data includes `CrashStatePlaneX` and `CrashStatePlaneY` (Washington State
Plane coordinate system). CrashMap uses only `Latitude`, `Longitude`, and the PostGIS `geom`
generated column — the State Plane columns are never queried or exposed. Drop them:

```sql
ALTER TABLE crashdata
  DROP COLUMN "CrashStatePlaneX",
  DROP COLUMN "CrashStatePlaneY";
```

### 0.3 Clear all existing data

For a full data replacement, truncate the table:

```sql
TRUNCATE TABLE crashdata;
```

`TRUNCATE` is faster than `DELETE FROM` for a full clear and preserves the table structure,
constraints, and indexes.

### 0.4 Update Prisma schema in CrashMap

After dropping DB columns, the CrashMap Prisma schema must be updated to match — otherwise
every `crashdata` query will fail with "column does not exist."

In `prisma/schema.prisma` (CrashMap repo), remove these two lines from the `CrashData` model:

```prisma
crashStatePlaneX     Float?   @map("CrashStatePlaneX") @db.Real
crashStatePlaneY     Float?   @map("CrashStatePlaneY") @db.Real
```

Regenerate the Prisma client and deploy:

```bash
npx prisma generate
```

Push to `main` to trigger Render auto-deploy. No `prisma migrate` is needed — the DB change
was applied manually in step 0.2.

---

## Stage 1: Fetch Data from WSDOT

The pipeline calls the WSDOT REST API directly from the backend — no browser export,
no copy-paste required.

### 1.1 Open the CrashMap Data Pipeline

Navigate to the deployed pipeline app (Render URL) or run it locally:

```bash
# Local development
cd backend && python app.py
# In another terminal:
cd frontend && npm run dev
# Open http://localhost:5173
```

### 1.2 Select the mode

In the **Mode** dropdown, select:

- `Pedestrian` — fetches "Pedestrians by Injury Type"
- `Bicyclist` — fetches "Bicyclists by Injury Type"

> **Double-check the mode.** Every record in the `.sql` file is stamped with the selected
> mode. Fetching bicyclist data while `Pedestrian` is selected will mislabel all records.

### 1.3 Set the date range

Enter a **Start Date** and **End Date**. The WSDOT tool goes back 10 years.

For the initial 10-year backfill, run the import separately for each year range you need.

> **Tip:** For the initial backfill, run Pedestrian for all 10 years first, then Bicyclist.

### 1.4 Generate and download

Click **Fetch from WSDOT & Download SQL**. The backend will:

1. Call the WSDOT API for the selected mode and date range
2. Decode the double-encoded JSON response
3. Map all fields to CrashMap's schema
4. Generate batched `INSERT ... ON CONFLICT DO UPDATE` statements guarded to preserve Pedestrian records
5. Return a `.sql` file download

The `.sql` file downloads automatically to your browser's default download folder.
The filename follows the pattern `crashmap_<mode>_<startdate>_<enddate>.sql`
(e.g. `crashmap_pedestrian_20250101_20251231.sql`).

### 1.5 Repeat for the other mode

Run the full workflow a second time with the other mode selected.

Always import the Pedestrian `.sql` file before the Bicyclist `.sql` file.

---

### Fallback: Manual Copy from DevTools

If the direct API fetch is unavailable (network restrictions, API changes, testing), you
can manually copy the response from the browser and paste it into the pipeline.

1. Open the WSDOT portal in a browser
2. Open **DevTools** → **Network** tab
3. Apply your filters (date range, report type) and trigger the data load
4. Find the `GetPublicPortalData` request in the Network tab
5. Click it → **Response** tab → select all → copy
6. In the pipeline, expand the **Debug: Fix Raw JSON** section and paste the response
   to confirm the JSON parses correctly
7. To generate SQL from the copied response, use `POST /api/generate-sql` directly via
   `curl` or a tool like Insomnia/Postman (see `ARCHITECTURE.md` §7)

The raw response is a single line of double-encoded JSON — this is expected.

---

## Stage 2: Generate SQL

Stage 2 is handled automatically inside Stage 1. When you click **Fetch from WSDOT &
Download SQL**, the backend fetches the data, decodes the JSON, maps the fields, and
streams the resulting `.sql` file back to your browser as an automatic download.

There is no separate "generate" step — the download is the output of the fetch.

---

## Stage 3: Import into CrashMap's Database

### 3.1 Get the database connection string

The `DATABASE_URL` for CrashMap's Render PostgreSQL is stored in the Render dashboard
environment variables. It looks like:

```text
postgresql://user:password@hostname.render.com:5432/dbname?sslmode=require
```

> **Never commit this value to git.** Copy it temporarily into your terminal session only.

### 3.2 Run the SQL file

#### Option A — `psql` (command line)

```bash
psql "$DATABASE_URL" -f crashmap_import_2026-02-24.sql
```

You should see output like:

```text
INSERT 0 500
INSERT 0 500
INSERT 0 432
```

Each line corresponds to one batch. The number after `INSERT 0` is the rows inserted or
updated. A Bicyclist row that conflicts with an existing Pedestrian row is left unchanged
by the upsert guard; re-importing matching-mode data updates the existing row.

#### Option B — GUI tool (pgAdmin, TablePlus, DBeaver)

1. Connect to the Render database using the connection string
2. Open a Query window
3. Open or paste the `.sql` file contents
4. Execute

### 3.3 Verify the import

Run a quick check to confirm records were inserted:

```sql
SELECT "Mode", EXTRACT(YEAR FROM "CrashDate") AS year, COUNT(*)
FROM crashdata
GROUP BY "Mode", year
ORDER BY year DESC, "Mode";
```

Expected: new rows visible for the mode and year(s) you imported.

Also spot-check a specific record from your source data:

```sql
SELECT * FROM crashdata WHERE "ColliRptNum" = '3838031';
```

---

## Stage 4: Refresh CrashMap Materialized Views

CrashMap's filter dropdowns (counties, cities, years) are populated from two materialized
views. **These must be refreshed manually after every import.** Until you refresh them,
new records will appear on the map but may not show in filters.

### 4.1 Run the refresh

```sql
REFRESH MATERIALIZED VIEW filter_metadata;
REFRESH MATERIALIZED VIEW available_years;
```

Run these in the same `psql` session or GUI tool used in Stage 3.

### 4.2 Verify the refresh

```sql
-- Check that new counties/cities appear
SELECT DISTINCT county FROM filter_metadata ORDER BY county;

-- Check that new years appear
SELECT year FROM available_years ORDER BY year DESC;
```

### 4.3 Check the CrashMap app

Open CrashMap and verify:

- New records appear as dots on the map
- Year filter includes newly imported year(s)
- County and city filters include newly imported locations

---

## Full Import Checklist

Use this checklist each time you import new data.

### Pedestrian Import

- [ ] Open CrashMap Data Pipeline
- [ ] Set Mode = `Pedestrian`
- [ ] Set date range (e.g. `20250101` – `20251231`)
- [ ] Click **Fetch from WSDOT & Download SQL** — file downloads automatically
- [ ] Run `.sql` against Render PostgreSQL: `psql "$DATABASE_URL" -f <file>.sql`
- [ ] Confirm inserted/updated row counts in psql output
- [ ] Spot-check a record in the database

### Bicyclist Import (run after Pedestrian)

- [ ] Open CrashMap Data Pipeline
- [ ] Set Mode = `Bicyclist`
- [ ] Set same date range as Pedestrian import
- [ ] Click **Fetch from WSDOT & Download SQL** — file downloads automatically
- [ ] Run `.sql` against Render PostgreSQL: `psql "$DATABASE_URL" -f <file>.sql`
- [ ] Confirm inserted/updated row counts; Pedestrian conflicts are intentionally unchanged

### After Both Imports

- [ ] `REFRESH MATERIALIZED VIEW filter_metadata;`
- [ ] `REFRESH MATERIALIZED VIEW available_years;`
- [ ] Verify new records visible in CrashMap app
- [ ] Verify year and location filters updated
- [ ] Update `components/info/InfoPanelContent.tsx`: data range string (line ~57) and version/date footer (last `<section>`)
- [ ] Add entry to the Data Ingestion Log in this file

---

## Stage 5: Data Validation

Run these checks after completing any import — single year or full backfill — before
declaring the import complete. Run them after Stage 4 (materialized view refresh).

### 5.1 Record counts by mode and year

```sql
SELECT "Mode", EXTRACT(YEAR FROM "CrashDate") AS year, COUNT(*)
FROM crashdata
GROUP BY "Mode", year
ORDER BY year DESC, "Mode";
```

Expected: both `Pedestrian` and `Bicyclist` rows for every year in scope, with plausible
record counts. No unexpected `NULL` mode or years.

**Reference — initial backfill totals (2015–2026):**

| Mode         | Total records |
| ------------ | ------------- |
| Pedestrian   | 22,419        |
| Bicyclist    | 13,213        |
| **Combined** | **35,632**    |

### 5.2 Null checks on required fields

```sql
SELECT COUNT(*) FROM crashdata WHERE "ColliRptNum" IS NULL;
SELECT COUNT(*) FROM crashdata WHERE "Latitude" IS NULL OR "Longitude" IS NULL;
SELECT COUNT(*) FROM crashdata WHERE "CrashDate" IS NULL;
SELECT COUNT(*) FROM crashdata WHERE "Mode" IS NULL;
```

All four should return `0`.

### 5.3 PostGIS geometry check

```sql
SELECT COUNT(*) FROM crashdata WHERE geom IS NULL;
```

Expected: `0`. A non-zero count means some records have NULL coordinates — PostGIS cannot
generate `geom` for those rows and they will not appear on the map.

### 5.4 Spot-check sample records

```sql
SELECT "ColliRptNum", "Mode", "CrashDate", "CountyName", "CityName",
       "Latitude", "Longitude", ST_AsText(geom)
FROM crashdata
ORDER BY "CrashDate" DESC
LIMIT 5;
```

Verify: `CrashDate` is `YYYY-MM-DD` format, coordinates are within Washington State
(lat ~45–49°N, lon ~-124 to -116°W), `geom` is a valid `POINT(lng lat)`.

### 5.5 Mode totals

```sql
SELECT "Mode", COUNT(*) FROM crashdata GROUP BY "Mode" ORDER BY "Mode";
```

Cross-reference against expected totals for the imported date range. Significant
under-counts may indicate a failed or incomplete import batch.

---

## Troubleshooting

### "Failed to parse JSON" or "WSDOT API request failed" error

**Direct fetch path:** The WSDOT API may be temporarily unavailable or the date range
may have returned an empty response. Try a narrower date range, or wait and retry.
Use the DevTools fallback (see Stage 1) if the API is consistently unreachable.

**Fallback paste/upload path:** The pasted or uploaded content may be incomplete.
Copy the full response again from the DevTools Network tab — ensure you selected all
text in the Response panel. Do not open or edit the file in a text editor, as some
editors reformat or trim content.

### psql: SSL connection required

Add `?sslmode=require` to your connection string if it's not already present. Render
requires SSL for all external connections.

### psql: permission denied for table crashdata

You are connecting with the wrong database user or to the wrong database. Check the
`DATABASE_URL` in the Render dashboard.

### Records imported but don't appear on the map

The materialized views need refreshing. Run:

```sql
REFRESH MATERIALIZED VIEW filter_metadata;
REFRESH MATERIALIZED VIEW available_years;
```

Then hard-refresh the CrashMap browser tab (`Ctrl+Shift+R` / `Cmd+Shift+R`).

### Duplicate records (same crash in both ped and bike reports)

This is expected behavior, not an error. The guarded upsert preserves Pedestrian records:
a Pedestrian row can replace a Bicyclist row, but a Bicyclist conflict does not replace a
Pedestrian row. Import Pedestrian first, then Bicyclist, to keep the canonical record
without relying on import order for safety.

### Wrong mode selected for a file

If you realize you imported a bicyclist file as "Pedestrian" (or vice versa), the
affected records must be updated manually:

```sql
-- Fix mode for specific collision report numbers
UPDATE crashdata
SET "Mode" = 'Bicyclist'
WHERE "ColliRptNum" IN ('3838031', '3887523', ...);
```

Or, if the entire import needs to be redone, delete the affected records and re-import
with the correct mode:

```sql
-- Remove all records from a specific import date range with wrong mode
DELETE FROM crashdata
WHERE "Mode" = 'Pedestrian'
  AND "CrashDate" BETWEEN '2025-01-01' AND '2025-12-31'
  AND "ColliRptNum" IN (<list of affected ColliRptNums>);
```

Then refresh the materialized views and re-import with the correct mode.

---

## Local Development Setup

To run the pipeline locally:

```bash
# 1. Clone the repo
git clone https://github.com/nickmagruder/esri-exporter.git
cd esri-exporter

# 2. Backend
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py              # Runs on http://localhost:5000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                # Runs on http://localhost:5173
```

The Vite dev server proxies `/api/*` requests to the Flask backend automatically.

To verify the local setup: select Mode = `Bicyclist`, set a date range, and click
**Fetch from WSDOT & Download SQL**. Confirm a `.sql` file downloads and the INSERT
statements match the field mapping in `ARCHITECTURE.md`.
