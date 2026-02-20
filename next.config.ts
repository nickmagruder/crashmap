import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'

// Mapbox requires:
//   - connect-src: tile API, events/telemetry, geocoding
//   - img-src: tile images, sprites (also blob: for canvas snapshots)
//   - worker-src: mapbox-gl spawns workers via blob: URLs
// Next.js requires:
//   - script-src 'unsafe-inline': inline scripts for hydration
//   - script-src 'unsafe-eval': HMR eval in dev only
//   - style-src 'unsafe-inline': Tailwind / Mapbox inject inline styles
// Geist font via next/font/google is self-hosted at build time — no external font-src needed.
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.mapbox.com",
  "connect-src 'self' https://*.mapbox.com https://events.mapbox.com",
  'worker-src blob:',
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['react-map-gl', 'mapbox-gl'],
  devIndicators: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: cspDirectives },
          // belt-and-suspenders with frame-ancestors above
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // deny access to hardware not used by this app
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default nextConfig
