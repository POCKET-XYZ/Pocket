import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

/** Where the product (apps/web) lives; the same variable lib/links.ts reads. */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';

/**
 * The product's top-level pages. The landing took over the domain the
 * product used to answer on, so links to these pages (bookmarks, shared
 * jobs, old emails) are sent on to the same page in the product. Temporary
 * redirects: the product moves again when it goes to mainnet.
 */
const APP_PAGES = [
  'applications',
  'contracts',
  'dashboard',
  'disputes',
  'jobs',
  'login',
  'manager',
  'profile',
  'specialists',
  'startups',
  'verification',
  'wallet',
];

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
  async redirects() {
    return APP_PAGES.map((page) => ({
      source: `/${page}/:path*`,
      destination: `${APP_URL}/${page}/:path*`,
      permanent: false,
    }));
  },
};

export default nextConfig;
