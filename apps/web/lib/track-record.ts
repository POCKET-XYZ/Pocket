import type { TrackRecord } from '@pocket/shared';
import { api } from '@/lib/api';

/** What a specialist finished on Pocket, as their public profile shows it. */
export function fetchTrackRecord(userId: string): Promise<TrackRecord> {
  return api<TrackRecord>(`/profiles/${userId}/track-record`);
}
