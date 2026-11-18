Closes #

## What and why

## How tested

- [ ] `npm run lint`, `npm run format:check`, `npm run typecheck` and `npm test` pass
- [ ] Checked in the browser (dev server), where the UI changed

## Docs

- [ ] README changelog entry (newest at the bottom; no version bump)
- [ ] `PLAN.md`, `ARCHITECTURE.md`, `AGENTS.md` or `tutorial.md`, where affected

## After merge

Merging deploys to production. Smoke-test crashmap.io once the `main` CI run
(check, deploy, Lighthouse) finishes.
