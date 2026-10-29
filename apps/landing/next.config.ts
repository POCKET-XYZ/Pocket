import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

/**
 * The landing is static: no API, no wallets, no frames. So the policy is the
 * strictest of the two apps, everything from Pocket's own origin.
 */
const policy = [
  "default-src 'self'",
  // Next.js inlines its bootstrap scripts; nonces would make every page dynamic.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? ' ws:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

const securityHeaders = [
  { key: 'Content-Security-Policy', value: policy.join('; ') },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  ...(isDev
    ? []
    : [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains',
        },
      ]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Same reason as apps/web: the /_next/image optimizer stays off
  // (GHSA-2xp9-vwfh-vxw4). The renders are shipped already compressed instead.
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
