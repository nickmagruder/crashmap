import { describe, expect, it, vi } from 'vitest'
import { copyText } from '@/lib/clipboard'

describe('copyText', () => {
  it('writes the text and resolves true when the write succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    await expect(copyText('E123456', { writeText })).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('E123456')
  })

  it('resolves false instead of rejecting when the browser denies the write', async () => {
    const writeText = vi
      .fn()
      .mockRejectedValue(new DOMException('Write permission denied.', 'NotAllowedError'))
    await expect(copyText('E123456', { writeText })).resolves.toBe(false)
  })

  it('resolves false when there is no clipboard', async () => {
    await expect(copyText('E123456', undefined)).resolves.toBe(false)
  })
})
