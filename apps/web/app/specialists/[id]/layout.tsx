import type { Metadata } from 'next';

// Profiles are people: they stay reachable by link but out of search engines.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function SpecialistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
