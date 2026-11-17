import type * as Sentry from '@sentry/nextjs'

/**
 * Sentry settings shared by the browser, server and edge `Sentry.init` calls.
 */

// `@sentry/nextjs` doesn't re-export the `DataCollection` type, so derive it from the init options.
type DataCollection = NonNullable<NonNullable<Parameters<typeof Sentry.init>[0]>['dataCollection']>

/**
 * The path the browser sends Sentry events to on our own origin (so ad blockers don't drop them).
 * The server SDK's `serveTunnelIntegration` answers requests to this path and forwards them to Sentry.
 */
export const SENTRY_TUNNEL_PATH = '/monitoring'

/**
 * True for requests to Mapbox (style, sprites, glyphs, tiles, telemetry). The browser tracing
 * integration skips spans for these: map loading fires many parallel GETs, which Sentry's
 * performance detector flags as an "N+1 API Call", and their URLs carry the Mapbox access token.
 */
export function isMapboxRequest(url: string): boolean {
  try {
    const { hostname } = new URL(url, 'https://crashmap.io')
    return hostname === 'mapbox.com' || hostname.endsWith('.mapbox.com')
  } catch {
    return false
  }
}

/**
 * Browser error messages that are Mapbox GL internals, not CrashMap bugs. Mapbox's worker
 * serializer can't post a DOMException (e.g. an aborted tile fetch) between threads and throws
 * from its `blob:` worker script.
 */
export const MAPBOX_WORKER_SERIALIZE_ERROR = `Can't serialize object of unregistered class "DOMException"`

/**
 * What Sentry may collect. Sentry v11 collects everything when this is unset, so it is set explicitly.
 *
 * CrashMap has no accounts or personal data of its own, so visitor details stay out of Sentry: no user
 * info (which includes IP addresses), cookies, HTTP headers or HTTP bodies. URL query params stay on,
 * since they hold only the public filter state and help reproduce bugs. Prisma query results (public
 * crash rows) stay off to keep events small.
 */
export const SENTRY_DATA_COLLECTION: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: true,
  databaseQueryData: false,
}
