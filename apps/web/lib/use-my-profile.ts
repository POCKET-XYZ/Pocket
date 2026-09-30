'use client';

import type { SpecialistProfile, StartupProfile } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** The signed-in user's profile, or null while it is not filled in. */
export function useMyProfile() {
  return useQuery({
    queryKey: ['profile', 'me'],
    queryFn: () => api<StartupProfile | SpecialistProfile | null>('/profiles/me'),
  });
}
