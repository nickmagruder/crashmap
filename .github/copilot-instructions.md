# Copilot instructions for CrashMap

CrashMap ([crashmap.io](https://crashmap.io)) is a public, read-only web map of
crashes that injured or killed bicyclists and pedestrians in Washington State:
Next.js (App Router) + React + TypeScript, an Apollo GraphQL route over one
PostgreSQL + PostGIS table (Prisma 7), and Mapbox GL. Every merge to `main`
deploys to production, so review each PR as a production change.

Project context: `AGENTS.md`. Coding standards: `CONTRIBUTING.md`. Design and
file notes: `ARCHITECTURE.md`. Pending work: GitHub issues (linked from
`PLAN.md`).

## Reviewing pull requests

Use the `code-review` skill in `.github/skills/code-review/`. Review in this
order and rank findings most severe first:

1. **Correctness:** filter logic (all filters AND-combined; dates filter on
   `CrashDate`, never `FullDate`), severity bucket mapping, URL round-trip of
   filter state, empty and capped result sets, loading and error states.
2. **Security and privacy:** see the rules below.
3. **Accessibility (WCAG 2.1 AA):** labels for every control, keyboard access,
   focus management in overlays, `aria-live` counts, contrast, no
   information carried by colour alone.
4. **Tests:** new behaviour is covered by Vitest tests that assert behaviour,
   not implementation.
5. **Simplicity:** dead code, duplication, needless abstraction; the
   intentional simplifications in `AGENTS.md` (one table, no auth, no Redis,
   no DataLoader) are deliberate, so don't suggest replacing them.
6. **Docs:** README changelog entry (newest at the bottom; agents never bump
   the version on line 2), `PLAN.md`, `ARCHITECTURE.md` §11, `AGENTS.md` key
   files, where behaviour changes.

For each finding give the file and line, the problem, a concrete failure
scenario and a suggested fix. Skip style nits that Prettier or ESLint already
catch. If nothing significant turns up, say so.

## Rules the code must keep

- The GraphQL API is public and read-only: no mutations, no auth. Keep the
  depth limit (5), the per-IP rate limit (`lib/rate-limit.ts`), the CORS
  allow-list and parameterised Prisma queries (no raw SQL built from input).
- The `Content-Security-Policy` in `next.config.ts` only widens with a stated
  reason; no `unsafe-eval` outside development.
- Sentry stores no visitor IPs or other personal data
  (`SENTRY_DATA_COLLECTION` in `lib/sentryConfig.ts`); new noise filters go in
  the existing `beforeSend` list.
- Secrets (`DATABASE_URL`, Sentry and Render tokens) come from the
  environment or GitHub secrets, never from files or logs.
- Prisma: the table already exists; no `prisma migrate dev`, no schema
  changes without `prisma db pull`.
- `lib/graphql/__generated__/types.ts` is codegen output: change the schema
  and run `npm run codegen`, never edit it by hand.
- Map severity values dynamically: new `MostSevereInjuryType` values may
  arrive with new data.
- Call `map.resize()` after any panel opens or closes.
