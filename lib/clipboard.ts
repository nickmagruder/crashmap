/**
 * Copy text to the clipboard. Resolves to `true` once the write succeeds and
 * `false` when the clipboard is missing or the browser denies the write, so
 * callers never see a rejection.
 */
export async function copyText(
  text: string,
  clipboard: Pick<Clipboard, 'writeText'> | undefined = globalThis.navigator?.clipboard
): Promise<boolean> {
  if (!clipboard) return false
  try {
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
