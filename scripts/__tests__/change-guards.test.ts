import { describe, expect, it } from 'vitest'
import { checkDiff, OVERRIDE, parseDiff, SIZE_WARNING } from '../change-guards-rules'

/** A one-file unified diff with the given added and removed lines. */
function diffOf(path: string, added: string[], removed: string[] = []) {
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    '@@ -1 +1 @@',
    ...removed.map((l) => `-${l}`),
    ...added.map((l) => `+${l}`),
  ].join('\n')
}

describe('checkDiff', () => {
  it('passes ordinary code and test changes', () => {
    const diff =
      diffOf('lib/x.ts', ['export const x = 1']) +
      '\n' +
      diffOf('lib/__tests__/x.test.ts', ["it('works', () => expect(x).toBe(1))"])
    expect(checkDiff(diff).problems).toEqual([])
  })

  it('flags focused and skipped tests', () => {
    for (const line of [
      "it.only('a', () => {})",
      "describe.skip('b', () => {})",
      "xit('c', () => {})",
    ]) {
      expect(checkDiff(diffOf('lib/__tests__/x.test.ts', [line])).problems).toHaveLength(1)
    }
  })

  it('ignores .skip outside test files', () => {
    expect(checkDiff(diffOf('lib/list.ts', ['const rest = list.skip(1)'])).problems).toEqual([])
  })

  it('flags eslint-disable and TypeScript suppressions anywhere in code', () => {
    expect(
      checkDiff(diffOf('components/A.tsx', ['// eslint-disable-next-line no-console'])).problems
    ).toHaveLength(1)
    expect(
      checkDiff(diffOf('lib/a.ts', ['// @ts-expect-error wrong types'])).problems
    ).toHaveLength(1)
    expect(checkDiff(diffOf('lib/a.ts', ['// @ts-ignore'])).problems).toHaveLength(1)
  })

  it('ignores Markdown that mentions the patterns', () => {
    expect(
      checkDiff(diffOf('AGENTS.md', ['Never add `it.only` or `@ts-ignore`.'])).problems
    ).toEqual([])
  })

  it('flags a net loss of assertions in a test file', () => {
    const diff = diffOf(
      'lib/__tests__/x.test.ts',
      ['expect(a).toBe(1)'],
      ['expect(a).toBe(1)', 'expect(b).toBe(2)']
    )
    expect(checkDiff(diff).problems).toEqual([
      'lib/__tests__/x.test.ts: removes 1 assertion(s) net',
    ])
  })

  it('allows moving or rewriting assertions without losing any', () => {
    const diff = diffOf('lib/__tests__/x.test.ts', ['expect(b).toEqual(2)'], ['expect(b).toBe(2)'])
    expect(checkDiff(diff).problems).toEqual([])
  })

  it('flags assertions lost by deleting a test file', () => {
    const diff = [
      'diff --git a/lib/__tests__/gone.test.ts b/lib/__tests__/gone.test.ts',
      'deleted file mode 100644',
      '--- a/lib/__tests__/gone.test.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      "-it('a', () => expect(1).toBe(1))",
      '-',
    ].join('\n')
    expect(checkDiff(diff).problems).toEqual([
      'lib/__tests__/gone.test.ts: removes 1 assertion(s) net',
    ])
  })

  it('counts changed lines without lockfiles or generated code', () => {
    const big = Array.from({ length: SIZE_WARNING + 1 }, (_, i) => `line ${i}`)
    expect(checkDiff(diffOf('package-lock.json', big)).changedLines).toBe(0)
    expect(checkDiff(diffOf('lib/graphql/__generated__/types.ts', big)).changedLines).toBe(0)
    expect(checkDiff(diffOf('lib/big.ts', big)).changedLines).toBe(SIZE_WARNING + 1)
  })

  it('leaves the guard files themselves alone', () => {
    expect(checkDiff(diffOf('scripts/change-guards-rules.ts', ['/it.only/'])).problems).toEqual([])
  })
})

describe('parseDiff', () => {
  it('splits files and their added and removed lines', () => {
    const files = parseDiff(diffOf('a.ts', ['new'], ['old']))
    expect(files).toEqual([{ path: 'a.ts', added: ['new'], removed: ['old'] }])
  })
})

describe('OVERRIDE', () => {
  it('matches a Test-guard trailer with a reason only', () => {
    expect(OVERRIDE.test('Fix x\n\nTest-guard: the old test asserted a bug')).toBe(true)
    expect(OVERRIDE.test('Fix x\n\nTest-guard:')).toBe(false)
  })
})
