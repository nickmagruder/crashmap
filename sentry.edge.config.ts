// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'
import {
  SENTRY_DATA_COLLECTION,
  SENTRY_ENABLED,
  SENTRY_ENVIRONMENT,
  SENTRY_TUNNEL_PATH,
} from '@/lib/sentryConfig'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // production/staging only on Render; local production builds send nothing. See lib/sentryConfig.ts.
  environment: SENTRY_ENVIRONMENT,
  enabled: SENTRY_ENABLED,
  integrations: [
    // Logs are sent through this integration (Sentry v11 removed `enableLogs`).
    Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
    // Answers the browser's tunnel requests and forwards them to Sentry.
    Sentry.serveTunnelIntegration({ path: SENTRY_TUNNEL_PATH }),
  ],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // What Sentry may collect (no IPs, cookies, headers or bodies). See lib/sentryConfig.ts.
  dataCollection: SENTRY_DATA_COLLECTION,
})
