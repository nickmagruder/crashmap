---
applyTo: 'app/api/**/*.ts,lib/rate-limit.ts,lib/graphql/resolvers.ts,lib/graphql/typeDefs.ts,lib/prisma.ts,next.config.ts,instrumentation.ts,instrumentation-client.ts,sentry.*.config.ts,lib/sentryConfig.ts,render.yaml,.github/workflows/**'
---

# Security-critical code

These files decide what the public API accepts, what the browser may load,
what reaches Sentry and how the app deploys. Review every change here as a
possible security or privacy regression.

- **Public API:** queries stay read-only and shallow. The depth limit, rate
  limit and CORS allow-list run before any resolver; a new route or handler
  must not skip them. Resolvers build Prisma `where` clauses from validated
  filter input only, never raw SQL from strings.
- **Rate limiting:** the client IP comes from `getClientIp`; a change that
  trusts a different header lets one client dodge the limit.
- **CSP and headers:** a new source in the CSP needs a reason in the PR;
  never add `unsafe-eval` outside development or a wildcard host.
- **Sentry:** no IPs, cookies, request bodies or other personal data leave
  the app; keep `SENTRY_DATA_COLLECTION` and the tunnel path, and keep
  production reporting limited to Render builds.
- **Secrets:** environment variables and GitHub secrets only; workflows keep
  least-privilege `permissions`, actions pinned by commit SHA, and
  `persist-credentials: false` on checkout.
- **Deploys:** the `deploy` and `lighthouse` jobs run only on pushes to
  `main`; a change to that condition can deploy unreviewed code.
