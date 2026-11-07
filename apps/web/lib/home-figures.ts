import type {
  ContractSummary,
  DeliveryTimes,
  JobListing,
  MyApplication,
  ServiceCategory,
} from '@pocket/shared';

/** A count, and the page to deal with it: the item itself when there is only one. */
function withLink(ids: string[], one: (id: string) => string, many: string) {
  const unique = [...new Set(ids)];
  return {
    count: ids.length,
    href: unique.length === 1 ? one(unique[0] as string) : many,
  };
}

const contractLink = (id: string) => `/contracts/${id}`;

function milestonesIn(contracts: ContractSummary[], statuses: string[]): string[] {
  return contracts
    .filter((contract) => contract.status === 'active')
    .flatMap((contract) =>
      contract.milestones
        .filter((milestone) => statuses.includes(milestone.status))
        .map(() => contract.id),
    );
}

export function startupFigures(contracts: ContractSummary[], jobs: JobListing[]) {
  const reviewable = jobs.filter(
    (job) => job.status === 'open' && (job.submittedApplications ?? 0) > 0,
  );
  return {
    toConfirm: withLink(
      milestonesIn(contracts, ['delivered']),
      contractLink,
      '/contracts',
    ),
    applications: {
      count: reviewable.reduce((sum, job) => sum + (job.submittedApplications ?? 0), 0),
      href:
        reviewable.length === 1
          ? `/jobs/${(reviewable[0] as JobListing).id}/applicants`
          : '/dashboard',
    },
    reviewable,
  };
}

export function specialistFigures(
  contracts: ContractSummary[],
  applications: MyApplication[],
  openJobs: JobListing[],
  categories: ServiceCategory[],
) {
  const applied = new Set(applications.map((application) => application.job.id));
  return {
    toDeliver: withLink(
      milestonesIn(contracts, ['pending', 'changes_requested']),
      contractLink,
      '/contracts',
    ),
    waiting: applications.filter((application) => application.status === 'submitted')
      .length,
    // No categories on the profile yet: every open job is for them.
    forYou: openJobs.filter(
      (job) =>
        !applied.has(job.id) &&
        (categories.length === 0 || categories.includes(job.category)),
    ),
  };
}

/** A share of targets met or milestones on time, null when there is nothing to count. */
export function share(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

export function percent(value: number | null): string {
  return value === null ? '-' : `${Math.round(value * 100)}%`;
}

/**
 * How early deliveries come in, in a few words: "2 días antes", "1 día tarde"
 * or "en la fecha". Null before anything is delivered.
 */
export function deliveryWords(delivery: DeliveryTimes): string | null {
  const days = delivery.averageDaysEarly;
  if (days === null) return null;
  const size = Math.abs(days);
  const amount = `${size.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${
    size === 1 ? 'día' : 'días'
  }`;
  if (days >= 0.5) return `${amount} antes`;
  if (days <= -0.5) return `${amount} tarde`;
  return 'en la fecha';
}
