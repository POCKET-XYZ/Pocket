import type { Metadata } from 'next';
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

export const metadata: Metadata = {
  title: 'Pocket — Talento de growth. Pago garantizado on-chain.',
  description:
    'Startups contratan specialists verificados de growth, ventas y marketing, con cada pago protegido por escrow en Stellar.',
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
