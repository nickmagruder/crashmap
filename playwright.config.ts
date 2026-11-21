import { defineConfig, devices } from '@playwright/test'

// Post-deploy smoke tests against the live site (`npm run smoke`), run by CI
// after each deploy to production. SMOKE_URL points them elsewhere, e.g.
// `SMOKE_URL=http://localhost:3000 npm run smoke` against the dev server.
// Files are `*.smoke.ts` so Vitest's `*.test.ts`/`*.spec.ts` glob skips them.
export default defineConfig({
  testDir: 'smoke',
  testMatch: '**/*.smoke.ts',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.SMOKE_URL ?? 'https://crashmap.io',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
