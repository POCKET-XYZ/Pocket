import {
  feeBreakdown,
  totalAfterFees,
  type ContractSummary,
  type JobListing,
  type MyApplication,
  type ServiceCategory,
} from '@pocket/shared';

type SummaryMilestone = ContractSummary['milestones'][number];

/** A count, and the page to deal with it: the item itself when there is only one. */
export interface CountWithLink {
  count: number;
  href: string;
}

const withLink = (ids: string[], one: (id: string) => string, many: string) => {
  const unique = [...new Set(ids)];
  return {
    count: ids.length,
    href: unique.length === 1 ? one(unique[0] as string) : many,
  };
};

const contractLink = (id: string) => `/contracts/${id}`;

function milestonesIn(
  contracts: ContractSummary[],
  matches: (milestone: SummaryMilestone) => boolean,
): { contractId: string; milestone: SummaryMilestone }[] {
  return contracts.flatMap((contract) =>
    contract.milestones
      .filter(matches)
      .map((milestone) => ({ contractId: contract.id, milestone })),
  );
}

/**
 * What left the escrow towards the specialist for each milestone, before fees:
 * the whole milestone when paid, their share of it when a dispute split it.
 */
function paidOut(contracts: ContractSummary[]): string[] {
  return contracts.flatMap((contract) =>
    contract.milestones.flatMap((milestone) => {
      if (milestone.status === 'paid') return [milestone.amount];
      if (milestone.status === 'resolved') return [milestone.resolvedToSpecialist ?? '0'];
      return [];
    }),
  );
}

export function startupFigures(contracts: ContractSummary[], jobs: JobListing[]) {
  const active = contracts.filter((contract) => contract.status === 'active');
  const toConfirm = milestonesIn(active, (milestone) => milestone.status === 'delivered');
  const reviewable = jobs.filter(
    (job) => job.status === 'open' && (job.submittedApplications ?? 0) > 0,
  );
  const applications = reviewable.reduce(
    (sum, job) => sum + (job.submittedApplications ?? 0),
    0,
  );
  // Money stays in the escrow until a milestone is paid or its dispute resolved.
  const held = active.flatMap((contract) =>
    contract.milestones
      .filter((milestone) => !['paid', 'resolved'].includes(milestone.status))
      .map((milestone) => milestone.amount),
  );
  return {
    toConfirm: withLink(
      toConfirm.map((each) => each.contractId),
      contractLink,
      '/contracts',
    ),
    applications: {
      count: applications,
      href:
        reviewable.length === 1
          ? `/jobs/${(reviewable[0] as JobListing).id}/applicants`
          : '/dashboard',
    },
    reviewable,
    openContracts: contracts.filter((contract) =>
      ['awaiting_specialist', 'awaiting_funding', 'active'].includes(contract.status),
    ).length,
    held: feeBreakdown(held).total,
    released: feeBreakdown(paidOut(contracts)).total,
  };
}

export function specialistFigures(
  contracts: ContractSummary[],
  applications: MyApplication[],
  openJobs: JobListing[],
  categories: ServiceCategory[],
) {
  const active = contracts.filter((contract) => contract.status === 'active');
  const toDeliver = milestonesIn(active, (milestone) =>
    ['pending', 'changes_requested'].includes(milestone.status),
  );
  const applied = new Set(applications.map((application) => application.job.id));
  return {
    toDeliver: withLink(
      toDeliver.map((each) => each.contractId),
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
    collected: totalAfterFees(paidOut(contracts)),
  };
}
