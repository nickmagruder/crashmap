# Contributing

CrashMap is a personal project built in the open. Issues, questions and
suggestions are welcome; pull requests are welcome too, but please open an
issue first so we can agree on the change.

Much of the code is written by AI coding agents working to the same rules
below, and [`AGENTS.md`](AGENTS.md) holds the agent-facing version.

## How changes are made

- **Trunk-based.** `main` is always releasable and every merge deploys to
  production. Work happens on short-lived branches named for their issue
  (`feat/166-stacked-crashes`, `fix/`, `chore/`, `docs/`), merged by squash PR.
- **Every PR** links its issue (`Closes #166`), says how it was tested, and
  updates the docs it affects (README changelog, `PLAN.md`,
  `ARCHITECTURE.md`, `AGENTS.md`).
- **CI must pass** (`check`: lint with zero warnings, knip, change guards,
  Prettier, typecheck, Vitest with a coverage report, codegen drift, build).
  CodeQL and dependency review scan every PR. Every PR gets an AI review
  from a reviewer other than its author (whichever is the best choice at
  the time); address or answer its comments before merging.
- **Never weaken a test to make it pass:** no `.only`/`.skip`, no deleted
  or loosened assertions, no `eslint-disable` or `@ts-ignore`/`@ts-expect-error`
  to get past a check. The change guards (`scripts/change-guards.ts`) fail
  on these; when a change really needs one, add a `Test-guard: <reason>`
  line to the commit message and explain it under "Tests changed? Why:" in
  the PR. CI warns above about 400 changed lines (lockfiles and generated
  code excluded): split such PRs where they divide cleanly.
- **Commit messages:** imperative summary of 72 characters or fewer ("Add
  1yr date preset", not "Added…"), no trailing period, a blank line before
  the body; a body explains why when it isn't obvious; one logical change per
  commit. The commit-msg hook (`scripts/commit-msg.ts`) checks the summary.
- **Never skip the hooks** (`--no-verify`): the pre-commit hook runs ESLint
  and Prettier on staged files, then a gitleaks secret scan (install it with
  `winget install Gitleaks.Gitleaks` or your package manager).
- **Versioning:** the maintainer sets the version on line 2 of `README.md`.
  Every change gets a changelog entry, newest at the bottom.

## Coding standards

### Language and frameworks

- TypeScript with `strict`; no `any` without a comment saying why.
- Next.js App Router; React function components and hooks; shadcn/ui
  components before hand-rolled ones.
- GraphQL types come from codegen (`npm run codegen`); never edit
  `lib/graphql/__generated__/` by hand.
- Prisma 7 against an existing table: introspect with `prisma db pull`, never
  `prisma migrate dev`.

### Security and privacy

- The API is public and read-only; keep the depth limit, rate limit and CORS
  allow-list in front of every resolver, and build queries through Prisma,
  never raw SQL from input.
- Secrets come from environment variables or GitHub secrets, never files.
- Sentry collects no visitor IPs or personal data.
- Widen the Content Security Policy only with a stated reason.

### Accessibility

- WCAG 2.1 AA: labelled controls, full keyboard access, managed focus in
  overlays, status messages announced, sufficient contrast, and nothing
  conveyed by colour alone.

### Tests

- Vitest. New behaviour comes with tests that assert behaviour, not
  implementation details. Helper and resolver tests live next to the code in
  `__tests__/` folders.

### Style

- Prettier (`.prettierrc`) and ESLint decide formatting; don't fight them.
- Small components and functions with clear names; reuse existing helpers
  before adding new ones; no speculative abstractions.
- Comments explain why, not what. Dates are ISO `YYYY-MM-DD`.
