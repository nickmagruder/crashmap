import { expect, test } from '@playwright/test'

// The critical path after a deploy: the page loads without uncaught errors,
// the map renders, crashes load (the count appears), and the public API
// answers. The full manual checklist stays in AGENTS.md ("Smoke testing").

test('the map page loads, renders the map and shows a crash count', async ({ page, isMobile }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page).toHaveTitle(/CrashMap/)

  await expect(page.locator('canvas.mapboxgl-canvas')).toBeVisible({ timeout: 30_000 })

  // The desktop sidebar shows the count; on mobile it's in the filter overlay.
  if (!isMobile) {
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: /\d[\d,]* crashes/ })
        .first()
    ).toBeVisible({
      timeout: 30_000,
    })
  }

  expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([])
})

test('the GraphQL API answers a filter-options query', async ({ request }) => {
  const res = await request.post('/api/graphql', {
    data: { query: '{ filterOptions { states minDate maxDate } }' },
  })
  expect(res.status()).toBe(200)
  const body = (await res.json()) as {
    data?: { filterOptions?: { states: string[]; minDate: string; maxDate: string } }
  }
  expect(body.data?.filterOptions?.states).toContain('Washington')
  expect(body.data?.filterOptions?.maxDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})
