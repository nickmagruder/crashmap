# AI Prompts

Reusable prompts for working on CrashMap with an AI agent. Universal prompts live in clankers (`~/.claude/clankers/prompts/`); this file holds only what is specific to this project.

## Table of Contents

- [AI Prompts](#ai-prompts)
  - [Table of Contents](#table-of-contents)
  - [Claude Workflow](#claude-workflow)
    - [Close-Out-Session](#close-out-session)

---

## Claude Workflow

### Close-Out-Session

**Usage:** Say "close out session" at the end of a session. It runs the end-of-session sweep (memory, docs, plan, prompt review, checks, and production checks when the session deployed), then offers to ship the work as a pull request. It replaces the generic clankers `close-out-session` skill for this repo; that skill defers to this prompt.

```text
Close out this session: bring CrashMap's docs, plan, agent context and repository-local context
up to date with everything this conversation changed, verify the work, then offer to ship it.

Read first, every time (don't reconstruct the standards from memory): `AGENTS.md`, `PLAN.md`,
and this `PROMPTS.md`. Repository-local memory rules in `AGENTS.md` are authoritative; do not
read or write sidecar, machine-local, or in-application memory for this project.

Other sessions may be closing out at the same time. Scope every step to this session's own work,
and edit shared files (`PLAN.md`, `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `PROMPTS.md`)
by content-anchored replacement that matches exactly once, never by line number or whole-file
rewrite. Check `git diff` afterward.

Shared docs can change outside this session (Nick, GitHub Desktop, another session). Before relying
on a rule in `AGENTS.md` or `PROMPTS.md`, check `git log` and `git diff` for changes this session
didn't make. If one contradicts something decided in this session, ask before keeping or
overwriting it (2026-11-17: the AGENTS.md git rule had reverted to "never commit" mid-session).

Work through every step. Say which steps were no-ops instead of skipping them silently.

--- STEP 1: REPOSITORY-LOCAL CONTEXT ---
Project decisions, context, plans, notes, and session follow-ups belong in tracked repository
files such as `AGENTS.md`, `PLAN.md`, `ARCHITECTURE.md`, `PROMPTS.md`, or the relevant docs.
- Do not read or write sidecar, machine-local, application, or in-application memory for this
  project.
- True in every project → propose promoting it into clankers `global/AGENTS.md` or a
  `standards/` file. Don't edit clankers without a yes.

--- STEP 2: AGENT CONTEXT ---
- `AGENTS.md`: update Working rules, Conventions, Gotchas and Key files for anything this session
  added, renamed or learned. Key files stay one line each; per-file detail goes in
  `ARCHITECTURE.md` §11 "Implementation Notes".
- Check each doc claim against the actual files before calling it stale, then fix it.

--- STEP 3: PROJECT DOCS AND LINKS ---
- `README.md` changelog: one entry per piece of work, appended at the bottom, headed
  `### YYYY-MM-DD — Title`. Use the local Pacific date (`date +%F`), never UTC. Never edit the
  version on line 2; Nick bumps it by hand.
- `ARCHITECTURE.md` §11: update notes for every source file whose behavior changed.
- `tutorial.md`: update after significant steps (a new feature or architecture change), not for
  routine fixes or upgrades. Earlier chapters record the build as it happened, so don't rewrite
  them to the new setup. Add a chapter at the end (before the "work in progress" line) that
  says what replaced them, as the Phase 9 chapter does.
- Check facts in any new prose (counts, PR numbers, chapter or phase references, versions)
  against the repo and `git log` before writing them (2026-11-17: the first Phase 9 chapter
  draft said "eight PRs" and "Phase 6"; it was six and Phase 4).
- After a data import: update the Data Ingestion Log, the data date range in
  `InfoPanelContent.tsx`, and the other steps in `data-pipeline.md`.
- Renamed, moved or deleted files: grep the old path across `*.md`, `AGENTS.md`, and code comments,
  and fix each hit (leave historical changelog entries alone). Report the grep result, even when
  clean.
- New files: make sure the right index links to them (AGENTS.md Key files, ARCHITECTURE.md §11).
- Update the table of contents of any edited file whose headings changed.

--- STEP 4: PLAN ---
- Tick finished items in `PLAN.md`, adding a short note of what was done and verified, as the
  Phase 9 items do. Comment on, or close through the PR, the GitHub issue each item links to.
- Every loose end raised but not finished becomes a GitHub issue (label `follow-up`, or `bug` for
  defects; body: why, what, "Done when"), added to the CrashMap board with
  `gh project item-add 2 --owner nickmagruder --url <issue url>`. Link it from `PLAN.md` under the
  relevant phase, or under `## Bugs` for defects, with the date it was flagged.
- Never delete section headings or other people's items. Work that is truly separate and worth
  doing next: propose it, don't start it.

--- STEP 5: PROMPT REVIEW ---
Review this prompt and every skill or prompt that ran this session against what actually happened:
- A judgment call you had to make → write the answer in.
- A result that needed correcting → add the rule that would have prevented it.
- A redundant step → trim it. An improvised step that should be permanent → add it.
Change only what the session gave concrete evidence for. Edit this file directly. Propose edits
to clankers files and wait for a yes.

--- STEP 6: VERIFY ---
Run the checks that match what changed (Node 24, as `.nvmrc` pins):
- Any code: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- GraphQL schema or queries: `npm run codegen`, then `git diff --exit-code
  lib/graphql/__generated__/types.ts`.
- Every session: `npm run format:check` (Prettier also formats the Markdown; there is no
  markdownlint here, so don't add one).
- Dependencies changed: report the `npm audit` count before and after.
Fix problems this session introduced; report older ones without fixing them. If a check can't
run, say so and say what you checked instead.

--- STEP 7: PRODUCTION CHECKS (only if this session deployed) ---
Run this step when work from this session merged to `main` and deployed. Otherwise it's a no-op.
- CI: `gh run list --branch main` and confirm the merge commit's `check`, `deploy` and
  `lighthouse` jobs succeeded.
- Smoke test crashmap.io in Chrome with the AGENTS.md "Smoke testing" checklist, focusing on what
  the session changed. Read relevant repository documentation first; do not rely on sidecar
  memory.
- Render logs (dashboard → CrashMap → `crashmap` → Logs, last hour): no new errors or warnings
  since the deploy, and none from the new instance id.
- Sentry: no new unresolved issues since the deploy
  (`magruderinfo.sentry.io/issues/?project=4510937620873216`).
- Don't change Render or Sentry settings, or resolve or archive Sentry issues, without Nick's yes.
Record the result in `PLAN.md` next to the item it verifies.

--- STEP 8: SHIP ---
Per AGENTS.md, shipping is the natural next step for finished work: skip it only for exploratory or
unfinished work, or when Nick said to hold off (then end with a proposed commit message).
1. `git status --short`. If on `main`, or on a branch whose PR is already merged
   (`gh pr view --json state`), create a fresh branch from the latest `main`:
   `git fetch origin && git switch -c <type>/<issue>-<short-name> origin/main`, carrying the
   uncommitted changes over. Types: `feat`, `fix`, `chore`, `docs`. No issue yet? Create one first.
2. Stage only this session's files by path (never `git add -A`). Never stage `.env*`; `.claude/`
   is gitignored. Commit with the proposed message and the attribution line the session's
   instructions specify. The husky pre-commit hook runs lint-staged; fix what it reports.
3. `git push -u origin <branch>`, then `gh pr create --base main` with a body that starts
   `Closes #<issue>` and follows `.github/pull_request_template.md`, ending with the PR
   attribution line.
4. Copilot reviews the PR automatically: fix the valid comments, reply with a reason to the rest,
   and resolve the threads before handing the PR to Nick. Offer to turn on Auto-fix for the PR. Never merge it, never enable auto-merge, and never push
   to `main`: Nick merges.

--- STEP 9: REPORT ---
List: files created and edited; repository-local context changes (and any proposals for clankers);
prompt edits from Step 5; plan items ticked and added; check results; production check results or
"no deploy"; the PR URL or the proposed commit message; no-op steps; anything left unverified.

Out of scope: renaming files, restructuring folders, or starting new work during a close-out.
Make the mechanical fixes a rename requires, and park anything bigger in `PLAN.md`.
```
