import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['react-map-gl', 'mapbox-gl'],
  devIndicators: false,
}

export default nextConfig
