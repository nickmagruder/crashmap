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
