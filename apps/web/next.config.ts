import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Pocket draws images with plain <img>, never next/image, so the optimizer
  // endpoint (/_next/image) is not needed. It is also where Next.js 16.3.1's
  // unauthenticated remote code execution lives (GHSA-2xp9-vwfh-vxw4, AVIF in
  // sharp), so it stays off even after the upgrade.
  images: { unoptimized: true },
};

export default nextConfig;
