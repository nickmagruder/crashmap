import { NextRequest } from 'next/server'

const WINDOW_MS = 60_000
const MAX_REQUESTS = 60

// Map<ip, request timestamps[]> — timestamps are ms epoch values, oldest-first
const store = new Map<string, number[]>()

// Periodic sweep: evict IPs with no activity in the last window
setInterval(
  () => {
    const cutoff = Date.now() - WINDOW_MS
    for (const [ip, timestamps] of store) {
      const fresh = timestamps.filter((t) => t >= cutoff)
      if (fresh.length === 0) store.delete(ip)
      else store.set(ip, fresh)
    }
  },
  5 * 60 * 1000
)

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return '127.0.0.1'
}

/**
 * Returns null if the request is allowed.
 * Returns a 429 Response if the rate limit is exceeded.
 */
export function checkRateLimit(ip: string): Response | null {
  const now = Date.now()
  const cutoff = now - WINDOW_MS
  const timestamps = (store.get(ip) ?? []).filter((t) => t >= cutoff)

  if (timestamps.length >= MAX_REQUESTS) {
    const retryAfter = Math.ceil((timestamps[0] + WINDOW_MS - now) / 1000)
    return new Response(
      JSON.stringify({
        errors: [
          {
            message: 'Too many requests. Please slow down.',
            extensions: { code: 'RATE_LIMITED' },
          },
        ],
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfter),
        },
      }
    )
  }

  timestamps.push(now)
  store.set(ip, timestamps)
  return null
}
