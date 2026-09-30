import type { Metadata } from 'next';
import { Fredoka, Inter } from 'next/font/google';
import { AuthProvider } from '@/components/auth-provider';
import { PollarSessionProvider } from '@/components/pollar-session';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter, TermsGate } from '@/components/terms';
import { ReactQueryClientProvider } from '@/components/tw-blocks/providers/ReactQueryClientProvider';
import { WalletProvider } from '@/components/tw-blocks/providers/WalletProvider';
import { Toaster } from '@/components/ui/sonner';
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
  title: { default: 'Pocket', template: '%s | Pocket' },
  description:
    'The marketplace where startups hire vetted growth, sales and marketing specialists, with every payment protected by escrow on Stellar.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${fredoka.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ReactQueryClientProvider>
          <WalletProvider>
            <PollarSessionProvider>
              <AuthProvider>
                <SiteHeader />
                <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6">
                  {children}
                </main>
                <SiteFooter />
                <TermsGate />
                <Toaster theme="light" richColors position="top-center" />
              </AuthProvider>
            </PollarSessionProvider>
          </WalletProvider>
        </ReactQueryClientProvider>
      </body>
    </html>
  );
}
