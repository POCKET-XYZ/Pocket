import type { Metadata, Viewport } from 'next';
import { Fredoka, Inter } from 'next/font/google';
import { SmoothScroll } from '@/components/smooth-scroll';
import './globals.css';

const fredoka = Fredoka({
  variable: '--font-fredoka',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const title = 'Pocket: tu equipo de growth, sin miedo a contratar';
const description =
  'Encuentra expertos verificados en marketing, ventas y growth. Solo pagas cuando apruebas el trabajo.';

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
    <html lang="es" className={`${fredoka.variable} ${inter.variable} antialiased`}>
      <body>
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
