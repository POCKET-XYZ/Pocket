'use client';

import { useParams } from 'next/navigation';
import { SpecialistProfileView } from '@/components/profile/specialist-profile-view';

/** A specialist's public profile (see SpecialistProfileView). */
export default function SpecialistProfilePage() {
  const { id } = useParams<{ id: string }>();
  return <SpecialistProfileView id={id} />;
}
