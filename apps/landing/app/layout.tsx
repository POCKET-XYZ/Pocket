import type { Metadata, Viewport } from 'next';
import { Anton, Figtree, Inter } from 'next/font/google';
import { SmoothScroll } from '@/components/smooth-scroll';
import './globals.css';

// Brand type: Figtree for titles, Anton for big data,
// Inter for everything else.
const figtree = Figtree({
  variable: '--font-figtree',
  subsets: ['latin'],
  weight: ['700', '800'],
});

const anton = Anton({
  variable: '--font-anton',
  subsets: ['latin'],
  weight: '400',
});

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const title = 'Pocket: crece más rápido, paga seguro';
const description =
  'Encuentra expertos en marketing, ventas y growth. Solo pagas cuando apruebas el trabajo.';

export const metadata: Metadata = {
  // Shared links need absolute image URLs; set NEXT_PUBLIC_SITE_URL per deploy.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3002'),
  title,
  description,
  openGraph: { title, description, type: 'website', locale: 'es_ES', siteName: 'Pocket' },
  twitter: { card: 'summary_large_image', title, description },
};

// The mobile browser bar takes the navy of the page's own nav.
export const viewport: Viewport = {
  themeColor: '#0f2e52',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="es"
      className={`${figtree.variable} ${anton.variable} ${inter.variable} antialiased`}
    >
      <body>
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
