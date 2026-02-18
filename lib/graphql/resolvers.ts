// Stub resolvers — real Prisma implementations come in the next step.

export const resolvers = {
  Query: {
    crashes: () => ({ items: [], totalCount: 0 }),
    crash: () => null,
    crashStats: () => ({
      totalCrashes: 0,
      totalFatal: 0,
      byMode: [],
      bySeverity: [],
      byCounty: [],
    }),
    filterOptions: () => ({}),
  },

  // FilterOptions fields have their own arguments (for cascading dropdowns),
  // so they need explicit resolvers on the type rather than just the Query level.
  FilterOptions: {
    states: () => [],
    counties: () => [],
    cities: () => [],
    years: () => [],
    severities: () => [],
    modes: () => [],
  },
}
