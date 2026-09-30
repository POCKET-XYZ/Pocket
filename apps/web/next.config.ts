import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api')
  .origin;
const horizon =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org';

/** Where Pollar's modal and the wallets open their windows and frames. */
const FRAMES = [
  'https://*.pollar.xyz',
  'https://albedo.link',
  'https://verify.walletconnect.com',
  'https://verify.walletconnect.org',
];

/**
 * The policy the browser enforces. What matters most is closed: no script
 * from another site, no plugins, no <base> rewrite, no posting forms away and
 * no framing of Pocket (a hidden frame could trick a click on Approve).
 * connect-src stays open to any https origin because each wallet talks to its
 * own servers; the stricter list below reports what it would block.
 */
const enforced = [
  "default-src 'self'",
  // Next.js inlines its bootstrap scripts; nonces would make every page dynamic.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin} https: wss:${isDev ? ' ws:' : ''}`,
  `frame-src 'self' ${FRAMES.join(' ')}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];
// Only where the API itself is https: a local `next start` talks to http.
if (!isDev && apiOrigin.startsWith('https:')) enforced.push('upgrade-insecure-requests');

/** The same policy with connect-src narrowed to the origins Pocket knows. */
const reportOnly = enforced
  .filter((directive) => directive !== 'upgrade-insecure-requests')
  .map((directive) =>
    directive.startsWith('connect-src')
      ? [
          "connect-src 'self'",
          apiOrigin,
          horizon,
          'https://*.pollar.xyz',
          'https://*.walletconnect.com',
          'wss://*.walletconnect.com',
          'https://*.walletconnect.org',
          'wss://*.walletconnect.org',
          'https://stellar.creit.tech',
          ...(isDev ? ['ws:'] : []),
        ].join(' ')
      : directive,
  );

const securityHeaders = [
  { key: 'Content-Security-Policy', value: enforced.join('; ') },
  { key: 'Content-Security-Policy-Report-Only', value: reportOnly.join('; ') },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
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
  // Pocket draws images with plain <img>, never next/image, so the optimizer
  // endpoint (/_next/image) is not needed. It is also where Next.js 16.3.1's
  // unauthenticated remote code execution lives (GHSA-2xp9-vwfh-vxw4, AVIF in
  // sharp), so it stays off even after the upgrade.
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
