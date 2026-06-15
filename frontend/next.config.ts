import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
    // Local images served from /public - no config needed
  },
  // Allow the app to run on custom port if needed
  typescript: {
    // Type checking is done during CI, not build
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
