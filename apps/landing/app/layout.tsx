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
  title: 'Pocket — Tu equipo de growth, sin miedo a contratar',
  description:
    'Encuentra expertos verificados en marketing, ventas y growth. Solo pagas cuando apruebas el trabajo.',
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
