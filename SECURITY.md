# Security policy

CrashMap is a public, read-only map of crash data, so the main risks are the
public GraphQL API, the hosting and what the site collects about visitors.

## Reporting a vulnerability

Please report privately through GitHub:
[Report a vulnerability](https://github.com/nickmagruder/crashmap/security/advisories/new)
(Security tab › Advisories). Don't open a public issue for a vulnerability.

Include what you found, how to reproduce it and the impact you expect. I'll
reply within a week. This is a personal project, so there's no bounty.

## Supported versions

Only the live site ([crashmap.io](https://crashmap.io)) and the latest commit
on `main` get fixes.

## In scope

- Getting past the GraphQL API's depth limit, rate limit or CORS allow-list
  (`app/api/graphql/route.ts`, `lib/rate-limit.ts`)
- Injection through filter input (`lib/graphql/resolvers.ts`)
- Cross-site scripting or a weakened Content Security Policy
  (`next.config.ts`)
- Visitor data (IP addresses, request bodies) reaching Sentry or logs
- Secrets exposed in the repo, the client bundle or CI

## Out of scope

- The accuracy of the crash data itself (open an issue instead)
- Volumetric denial of service against the hosting
- Vulnerabilities in Mapbox, Render, Sentry or other third parties (report
  those to them)
