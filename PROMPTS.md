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
Close out this session: bring CrashMap's docs, plan, agent context and memory up to date with
everything this conversation changed, verify the work, then offer to ship it.

Read first, every time (don't reconstruct the standards from memory): `AGENTS.md`, `PLAN.md`,
this `PROMPTS.md`, and the auto-memory index
`~/.claude/projects/C--Users-nickm-source-repos-crashmap/memory/MEMORY.md` with the memory files
it links that look relevant.

Other sessions may be closing out at the same time. Scope every step to this session's own work,
and edit shared files (`PLAN.md`, `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, the memory index)
by content-anchored replacement that matches exactly once, never by line number or whole-file
rewrite. Check `git diff` afterward.

Work through every step. Say which steps were no-ops instead of skipping them silently.

--- STEP 1: MEMORY ---
Auto-memory here is machine-local and personal. Project facts belong in the repo.
- A personal or machine-local note (browser setup, local tool quirks, how to drive a dashboard)
  → a memory file, with frontmatter (`name`, `description`, `metadata.type`), the fact, and
  **Why:** / **How to apply:** lines for `feedback` and `project` types. Link related memories
  with `[[name]]`. Add or update its one-line entry in `MEMORY.md`.
- A fact about the project that any contributor or agent needs (a hosting quirk, a gotcha, a
  testing rule) → `AGENTS.md`, not memory. If a memory already holds one, move it and leave the
  memory pointing at AGENTS.md.
- True in every project → propose promoting it into clankers `global/AGENTS.md` or a
  `standards/` file. Don't edit clankers without a yes.
- Search existing memories by topic first; update rather than duplicate. Don't save what the repo,
  git history or AGENTS.md already says.

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
  routine fixes or upgrades.
- After a data import: update the Data Ingestion Log, the data date range in
  `InfoPanelContent.tsx`, and the other steps in `data-pipeline.md`.
- Renamed, moved or deleted files: grep the old path across `*.md`, `AGENTS.md`, code comments and
  memory, and fix each hit (leave historical changelog entries alone). Report the grep result,
  even when clean.
- New files: make sure the right index links to them (AGENTS.md Key files, ARCHITECTURE.md §11).
- Update the table of contents of any edited file whose headings changed.

--- STEP 4: PLAN ---
- Tick finished items in `PLAN.md`, adding a short note of what was done and verified, as the
  Phase 9 items do.
- Add every loose end raised but not finished as an unchecked item with a one-line reason and the
  date it was flagged: under the relevant phase, or under `## Bugs` for defects.
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
  the session changed. Read the Chrome memory notes first (layout quirks, the
  `/sentry-example-page` 400 that's expected, and how to inspect Sentry envelopes).
- Render logs (dashboard → CrashMap → `crashmap` → Logs, last hour): no new errors or warnings
  since the deploy, and none from the new instance id.
- Sentry: no new unresolved issues since the deploy
  (`magruderinfo.sentry.io/issues/?project=4510937620873216`).
- Don't change Render or Sentry settings, or resolve or archive Sentry issues, without Nick's yes.
Record the result in `PLAN.md` next to the item it verifies.

--- STEP 8: SHIP (offer first) ---
Per AGENTS.md, commit only when Nick asks in the session. End with a proposed commit message and
ask whether to ship. On a yes:
1. `git status --short`. If on `main`, or on a branch whose PR is already merged
   (`gh pr view --json state`), create a fresh branch from the latest `main`:
   `git fetch origin && git switch -c <type>/<short-name> origin/main`, carrying the uncommitted
   changes over. Types: `feat`, `fix`, `chore`, `docs`.
2. Stage only this session's files by path (never `git add -A`). Never stage `.env*`; `.claude/`
   is gitignored. Commit with the proposed message and the attribution line the session's
   instructions specify. The husky pre-commit hook runs lint-staged; fix what it reports.
3. `git push -u origin <branch>`, then `gh pr create --base main` with a body covering what
   changed, why, verification, and anything for reviewers or after merge, ending with the PR
   attribution line.
4. Offer to turn on Auto-fix for the PR. Never merge it, never enable auto-merge, and never push
   to `main`: Nick merges.

--- STEP 9: REPORT ---
List: files created and edited; memories added or updated (and any proposed for clankers); prompt
edits from Step 5; plan items ticked and added; check results; production check results or "no
deploy"; the PR URL or the proposed commit message; no-op steps; anything left unverified.

Out of scope: renaming files, restructuring folders, or starting new work during a close-out.
Make the mechanical fixes a rename requires, and park anything bigger in `PLAN.md`.
```
