import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // `npm run test:coverage` (and CI) report coverage. No thresholds yet:
    // once the numbers settle, pin them at the current values so coverage
    // can only go up (a ratchet, not a target).
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: [
        'app/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        'context/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}',
      ],
      exclude: ['**/__tests__/**', '**/__generated__/**', 'lib/generated/**', 'components/ui/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
})
