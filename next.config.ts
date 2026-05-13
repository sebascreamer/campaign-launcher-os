import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '4gb', // Allow large video uploads
    },
  },
}

export default nextConfig
