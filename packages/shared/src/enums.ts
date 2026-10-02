/**
 * Domain enums shared by the API and the web client.
 * Values are stored as-is in the database, so never rename an existing value.
 */

/** Who a user is on the platform. Managers are Pocket's internal team. */
export const UserRole = {
  Startup: 'startup',
  Specialist: 'specialist',
  Manager: 'manager',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/**
 * Manual verification (lightweight KYC/KYB) lifecycle.
 * Nobody operates on the marketplace until a manager approves them.
 */
export const VerificationStatus = {
  NotSubmitted: 'not_submitted',
  Pending: 'pending',
  Approved: 'approved',
  Rejected: 'rejected',
} as const;
export type VerificationStatus =
  (typeof VerificationStatus)[keyof typeof VerificationStatus];

/**
 * Who holds the key of the wallet, which decides what it can sign. A wallet the
 * user connected signs anything; one that signs through Pollar pays and
 * receives, and signs escrow steps through Pollar's signer.
 */
export const WalletCustody = {
  External: 'external',
  Pollar: 'pollar',
} as const;
export type WalletCustody = (typeof WalletCustody)[keyof typeof WalletCustody];

/** Service areas a specialist can offer and a startup can hire for. */
export const ServiceCategory = {
  Growth: 'growth',
  Sales: 'sales',
  Marketing: 'marketing',
  DigitalMarketing: 'digital_marketing',
} as const;
export type ServiceCategory = (typeof ServiceCategory)[keyof typeof ServiceCategory];

/** Company stage shown on the standardized startup profile. */
export const StartupStage = {
  Idea: 'idea',
  PreSeed: 'pre_seed',
  Seed: 'seed',
  SeriesA: 'series_a',
  SeriesBPlus: 'series_b_plus',
} as const;
export type StartupStage = (typeof StartupStage)[keyof typeof StartupStage];

/** Outcome of a manager's review. Mirrors VerificationStatus without the initial state. */
export const VerificationDecision = {
  Approved: 'approved',
  Rejected: 'rejected',
} as const;
export type VerificationDecision =
  (typeof VerificationDecision)[keyof typeof VerificationDecision];

/**
 * Job lifecycle. A startup can close a job only while it is open, before
 * anyone is hired.
 */
export const JobStatus = {
  Open: 'open',
  InProgress: 'in_progress',
  Completed: 'completed',
  Closed: 'closed',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

/** A specialist's application to a job. */
export const ApplicationStatus = {
  Submitted: 'submitted',
  Accepted: 'accepted',
  Rejected: 'rejected',
  Withdrawn: 'withdrawn',
} as const;
export type ApplicationStatus =
  (typeof ApplicationStatus)[keyof typeof ApplicationStatus];

/** A contract from the startup's offer to the last payment. */
export const ContractStatus = {
  AwaitingSpecialist: 'awaiting_specialist',
  AwaitingFunding: 'awaiting_funding',
  Active: 'active',
  Completed: 'completed',
  Cancelled: 'cancelled',
} as const;
export type ContractStatus = (typeof ContractStatus)[keyof typeof ContractStatus];

export const MilestoneStatus = {
  Pending: 'pending',
  Delivered: 'delivered',
  ChangesRequested: 'changes_requested',
  Approved: 'approved',
  Paid: 'paid',
  Disputed: 'disputed',
  Resolved: 'resolved',
} as const;
export type MilestoneStatus = (typeof MilestoneStatus)[keyof typeof MilestoneStatus];

export const DisputeStatus = {
  Open: 'open',
  Resolved: 'resolved',
} as const;
export type DisputeStatus = (typeof DisputeStatus)[keyof typeof DisputeStatus];

/** What a manager decides on a disputed milestone. */
export const DisputeOutcome = {
  PaySpecialist: 'pay_specialist',
  RefundStartup: 'refund_startup',
  Split: 'split',
} as const;
export type DisputeOutcome = (typeof DisputeOutcome)[keyof typeof DisputeOutcome];

/** Every on-chain step Pocket records. */
export const ChainOperationKind = {
  Trustline: 'trustline',
  Deploy: 'deploy',
  Fund: 'fund',
  Approve: 'approve',
  Release: 'release',
  Dispute: 'dispute',
  Resolve: 'resolve',
  /** USDC the user sends from their wallet to another address. */
  Payment: 'payment',
} as const;
export type ChainOperationKind =
  (typeof ChainOperationKind)[keyof typeof ChainOperationKind];
