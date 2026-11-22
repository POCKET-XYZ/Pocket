'use client';

import { useParams } from 'next/navigation';
import { StartupProfileView } from '@/components/profile/startup-profile-view';

/** A startup's public profile (see StartupProfileView). */
export default function StartupProfilePage() {
  const { id } = useParams<{ id: string }>();
  return <StartupProfileView id={id} />;
}
