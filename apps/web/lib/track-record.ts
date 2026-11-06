import { ServiceCategory, type TrackRecord, type TrackRecordSummary } from '@pocket/shared';
import { api } from '@/lib/api';

/**
 * Stands in for the endpoint until the API has it, only when the flag is set.
 * Delete this flag and the mock below once the API answers.
 */
const MOCKED = process.env.NEXT_PUBLIC_MOCK_TRACK_RECORD === '1';

const MOCK_RECORD: TrackRecord = {
  completed: 4,
  milestones: { total: 12, onTime: 11 },
  kpis: { withTarget: 8, met: 7 },
  jobs: [
    {
      contractId: 'mock-1',
      title: 'Lanzar campaña de adquisición en LinkedIn para fintech B2B',
      sector: 'Fintech',
      category: ServiceCategory.Growth,
      completedAt: '2026-09-15T00:00:00.000Z',
      kpis: { withTarget: 2, met: 2 },
      onTime: true,
    },
    {
      contractId: 'mock-2',
      title: 'Secuencias de ventas salientes',
      sector: 'Salud',
      category: ServiceCategory.Sales,
      completedAt: '2026-07-02T00:00:00.000Z',
      kpis: { withTarget: 3, met: 2 },
      onTime: false,
    },
    {
      contractId: 'mock-3',
      title: 'Auditoría de marketing digital',
      sector: null,
      category: ServiceCategory.DigitalMarketing,
      completedAt: '2026-05-20T00:00:00.000Z',
      kpis: { withTarget: 0, met: 0 },
      onTime: true,
    },
    {
      contractId: 'mock-4',
      title: 'Plan de contenidos',
      sector: 'Educación',
      category: ServiceCategory.Marketing,
      completedAt: '2026-03-11T00:00:00.000Z',
      kpis: { withTarget: 3, met: 3 },
      onTime: true,
    },
  ],
};

const MOCK_CREATOR: TrackRecord = {
  completed: 3,
  milestones: { total: 6, onTime: 6 },
  kpis: { withTarget: 5, met: 4 },
  bestResult: {
    result: '12.400 vistas en TikTok',
    sector: 'Fintech',
    reportedAt: '2026-10-08T00:00:00.000Z',
  },
  jobs: [
    {
      contractId: 'mock-creator-1',
      title: 'Tres videos cortos sobre ahorro en dólares',
      sector: 'Fintech',
      category: ServiceCategory.Marketing,
      completedAt: '2026-10-08T00:00:00.000Z',
      kpis: { withTarget: 2, met: 2 },
      onTime: true,
    },
    {
      contractId: 'mock-creator-2',
      title: 'Reseña en Instagram para lanzamiento de app',
      sector: 'Educación',
      category: ServiceCategory.Marketing,
      completedAt: '2026-08-21T00:00:00.000Z',
      kpis: { withTarget: 2, met: 1 },
      onTime: true,
    },
    {
      contractId: 'mock-creator-3',
      title: 'Serie de historias con código de descarga',
      sector: 'Salud',
      category: ServiceCategory.Marketing,
      completedAt: '2026-06-12T00:00:00.000Z',
      kpis: { withTarget: 1, met: 1 },
      onTime: true,
    },
  ],
};

const MOCK_EMPTY: TrackRecord = {
  completed: 0,
  milestones: { total: 0, onTime: 0 },
  kpis: { withTarget: 0, met: 0 },
  jobs: [],
};

/** Some specialists have a record and some do not, so both cases can be seen. */
function mockFor(userId: string): TrackRecord {
  if (userId.includes('creator')) return MOCK_CREATOR;
  return userId.charCodeAt(userId.length - 1) % 2 === 0 ? MOCK_RECORD : MOCK_EMPTY;
}

export function fetchTrackRecord(userId: string): Promise<TrackRecord> {
  if (MOCKED) return Promise.resolve(mockFor(userId));
  return api<TrackRecord>(`/profiles/${userId}/track-record`);
}

/** The counts an application carries, if it carries them yet. */
export function applicantSummary(
  specialistId: string,
  sent: TrackRecordSummary | undefined,
): TrackRecordSummary | undefined {
  return sent ?? (MOCKED ? mockFor(specialistId) : undefined);
}
