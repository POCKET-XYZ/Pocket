import type { Metadata } from 'next';
import { HomePanel } from '@/components/home/home-panel';

// The public page about Pocket is the landing; this one should never compete with it.
export const metadata: Metadata = {
  title: 'Inicio',
  robots: { index: false },
};

export default function HomePage() {
  return <HomePanel />;
}
