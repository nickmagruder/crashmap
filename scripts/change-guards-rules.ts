// Rules for the CI change guards (`scripts/change-guards.ts`): patterns that
// let a change pass without being right, and a soft PR-size limit.
// Pure functions over a unified diff, so they're unit-tested.

/** Changed lines above this get a CI warning (never a failure). */
export const SIZE_WARNING = 400

/** Paths left out of the size count: lockfiles and generated code. */
const GENERATED = [/^package-lock\.json$/, /(^|\/)__generated__\//, /^lib\/generated\//]

/** The guard's own files, which name the patterns they look for. */
const SELF = [
  /^scripts\/change-guards(-rules)?\.ts$/,
  /^scripts\/__tests__\/change-guards\.test\.ts$/,
]

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/
const TEST_FILE = /(^|\/)__tests__\/|\.(test|spec)\.[jt]sx?$/

/** Escape hatch: a commit on the branch with `Test-guard: <reason>`. */
export const OVERRIDE = /^Test-guard:\s*\S/m

type Rule = { name: string; pattern: RegExp; tests: boolean }

const RULES: Rule[] = [
  {
    name: 'focused or skipped test',
    pattern: /\b(describe|it|test|suite)\.(only|skip)\b|\b(xit|xdescribe|fit|fdescribe)\(/,
    tests: true,
  },
  { name: 'eslint-disable comment', pattern: /eslint-disable/, tests: false },
  { name: 'TypeScript suppression', pattern: /@ts-(ignore|expect-error|nocheck)\b/, tests: false },
]

export type FileDiff = { path: string; added: string[]; removed: string[] }

/** Splits a `git diff` (unified, no renames detection needed) into files. */
export function parseDiff(diff: string): FileDiff[] {
  const files: FileDiff[] = []
  let current: FileDiff | null = null
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      current = null
      continue
    }
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).replace(/^b\//, '')
      if (path === '/dev/null') continue
      current = { path, added: [], removed: [] }
      files.push(current)
      continue
    }
    if (line.startsWith('--- ')) continue
    if (!current) {
      // A deleted file: `+++ /dev/null` came after `--- a/path`.
      continue
    }
    if (line.startsWith('+')) current.added.push(line.slice(1))
    else if (line.startsWith('-')) current.removed.push(line.slice(1))
  }
  return files
}

/** Files deleted outright (their `+++` is /dev/null), with their removed lines. */
export function deletedFiles(diff: string): FileDiff[] {
  const out: FileDiff[] = []
  const chunks = diff.split(/^diff --git /m).slice(1)
  for (const chunk of chunks) {
    if (!/^\+\+\+ \/dev\/null$/m.test(chunk)) continue
    const path = (chunk.match(/^--- a\/(.+)$/m) ?? [])[1]
    if (!path) continue
    const removed = chunk
      .split('\n')
      .filter((l) => l.startsWith('-') && !l.startsWith('--- '))
      .map((l) => l.slice(1))
    out.push({ path, added: [], removed })
  }
  return out
}

const countAssertions = (lines: string[]) =>
  lines.reduce((n, l) => n + (l.match(/\b(expect|assert)(\.\w+)?\(/g) ?? []).length, 0)

export type GuardResult = { problems: string[]; changedLines: number }

/** Checks a diff for weakened tests and suppressions, and counts its size. */
export function checkDiff(diff: string): GuardResult {
  const problems: string[] = []
  let changedLines = 0
  const files = [...parseDiff(diff), ...deletedFiles(diff)]
  for (const file of files) {
    if (!GENERATED.some((g) => g.test(file.path)))
      changedLines += file.added.length + file.removed.length
    if (SELF.some((s) => s.test(file.path)) || !CODE.test(file.path)) continue
    const isTest = TEST_FILE.test(file.path)
    for (const rule of RULES) {
      if (rule.tests && !isTest) continue
      for (const line of file.added) {
        if (rule.pattern.test(line))
          problems.push(`${file.path}: adds a ${rule.name}: ${line.trim()}`)
      }
    }
    if (isTest) {
      const lost = countAssertions(file.removed) - countAssertions(file.added)
      if (lost > 0) problems.push(`${file.path}: removes ${lost} assertion(s) net`)
    }
  }
  return { problems, changedLines }
}
