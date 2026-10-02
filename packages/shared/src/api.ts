import type {
  ApplicationStatus,
  ChainOperationKind,
  ContractStatus,
  DisputeOutcome,
  DisputeStatus,
  JobStatus,
  MilestoneStatus,
  ServiceCategory,
  StartupStage,
  UserRole,
  VerificationStatus,
  WalletCustody,
} from './enums';

/** ISO-8601 timestamp as serialized by the API. */
export type IsoDate = string;

export interface User {
  id: string;
  stellarAddress: string;
  role: UserRole;
  verificationStatus: VerificationStatus;
  /** Whether the wallet is the user's own or one they use through Pollar. */
  walletCustody: WalletCustody;
  /** Which wallet or login created the address: freighter, google, email... */
  walletProvider: string | null;
  /** Email verified by Pollar during login. Absent for wallet sign-ins. */
  email: string | null;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

// ---------------------------------------------------------------------------
// Auth: POST /auth/challenge, POST /auth/login
// ---------------------------------------------------------------------------

export interface ChallengeRequest {
  stellarAddress: string;
}

export interface ChallengeResponse {
  /** Unsigned transaction XDR for the wallet to sign. Never submitted. */
  xdr: string;
  networkPassphrase: string;
}

export type SignUpRole = Exclude<UserRole, 'manager'>;

export interface LoginRequest {
  stellarAddress: string;
  signedXdr: string;
  /** Required on the first login, when the account is created. */
  role?: SignUpRole;
}

/** Sign in with a Pollar session instead of a wallet signature. */
export interface PollarLoginRequest {
  /** Access token the Pollar SDK issued in the browser. */
  accessToken: string;
  /** Required on the first login, when the account is created. */
  role?: SignUpRole;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
  isNewUser: boolean;
}

/** What a wallet still needs before it can take part in an escrow. */
export interface WalletStatus {
  address: string;
  /** Whether the wallet exists on Stellar and trusts USDC. */
  usdc: 'ready' | 'no_account' | 'no_trustline';
  /**
   * XLM the wallet can spend on network fees, or null when the account is not
   * on the network yet. Every escrow step its owner signs pays a small fee.
   */
  xlmForFees: string | null;
  /**
   * USDC the wallet can send right now (its balance minus what open offers
   * lock), with up to 7 decimals. Null when the wallet does not hold USDC yet.
   */
  usdcSpendable: string | null;
}

/** POST /wallet/usdc-payment/prepare */
export interface UsdcPaymentRequest {
  /** The Stellar account (G...) that receives the USDC. */
  destination: string;
  /** Decimal string, more than zero, up to 7 decimals. */
  amount: string;
  /** Text memo, up to 28 bytes. Exchanges use it to tell deposits apart. */
  memo?: string;
}

/** POST /wallet/usdc-payment/submit */
export interface UsdcPaymentResult {
  txHash: string;
  amount: string;
  destination: string;
}

/** One USDC movement in or out of the wallet, GET /wallet/usdc-payments */
export interface UsdcPaymentRecord {
  id: string;
  txHash: string;
  createdAt: IsoDate;
  direction: 'in' | 'out';
  /** Who paid or got paid: an account (G...) or a contract such as an escrow (C...). */
  counterparty: string;
  amount: string;
}

/** Error codes the API returns in the `code` field of a 4xx body. */
export const ApiErrorCode = {
  RoleRequired: 'ROLE_REQUIRED',
  /** The wallet has never been funded, so it does not exist on the network yet. */
  StellarAccountNotFound: 'STELLAR_ACCOUNT_NOT_FOUND',
  /** The wallet has to trust USDC before it can receive or send it. */
  UsdcTrustlineRequired: 'USDC_TRUSTLINE_REQUIRED',
  /** The wallet does not hold enough spendable USDC to fund the escrow. */
  InsufficientUsdc: 'INSUFFICIENT_USDC',
} as const;
export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

// ---------------------------------------------------------------------------
// Verification: the manual KYC/KYB review every user goes through
// ---------------------------------------------------------------------------

/** What a user submits for review. Company fields only apply to startups. */
export interface VerificationSubmission {
  /** Legal name of the person submitting the request. */
  fullName: string;
  contactEmail: string;
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  linkedinUrl?: string;
  websiteUrl?: string;
  /** Startups: registered company name. */
  companyName?: string;
  /** Startups: company registration or tax id, when they have one. */
  companyRegistrationId?: string;
  /** Anything else the user wants the manager to know. */
  note?: string;
}

export interface VerificationRequest extends VerificationSubmission {
  id: string;
  userId: string;
  status: Exclude<VerificationStatus, 'not_submitted'>;
  reviewNote?: string | null;
  reviewedAt?: IsoDate | null;
  submittedAt: IsoDate;
}

/** Manager's decision on a request. A rejection must say why. */
export interface VerificationReview {
  note?: string;
}

// ---------------------------------------------------------------------------
// Profiles: the fixed templates both sides fill in
// ---------------------------------------------------------------------------

export interface StartupProfile {
  id: string;
  userId: string;
  companyName: string;
  oneLiner: string;
  sector: string;
  stage: StartupStage;
  lookingFor: string;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  /** Registered name, when it differs from the trading name. */
  legalName?: string | null;
  /** Role of the person who signs the contracts. */
  contactRole?: string | null;
  languages: string[];
  location?: string | null;
  updatedAt: IsoDate;
}

export interface CaseStudy {
  url: string;
  /** The outcome in one line. */
  result: string;
}

export interface SpecialistProfile {
  id: string;
  userId: string;
  displayName: string;
  headline: string;
  bio: string;
  categories: ServiceCategory[];
  skills: string[];
  /** Past work with its outcome, e.g. { url, result: '+40% followers in 2 months' }. */
  caseStudies: CaseStudy[];
  tools: string[];
  yearsExperience?: number | null;
  languages: string[];
  timezone?: string | null;
  /** Hours a week the specialist can take on. */
  weeklyHours?: number | null;
  /** Rates are in USDC. Serialized as strings to keep decimal precision. */
  hourlyRate?: string | null;
  minProjectBudget?: string | null;
  portfolioUrl?: string | null;
  linkedinUrl?: string | null;
  /** Link to the CV, e.g. a PDF on Google Drive. */
  cvUrl?: string | null;
  avatarUrl?: string | null;
  location?: string | null;
  updatedAt: IsoDate;
}

/** GET /profiles/:userId */
export interface PublicProfile {
  userId: string;
  role: UserRole;
  /**
   * The wallet shortened (GABC...WXYZ): enough to recognise it, not to look up
   * someone's balance and payments on chain from their name.
   */
  wallet: string;
  memberSince: IsoDate;
  profile: StartupProfile | SpecialistProfile;
}

/** A startup as the directory lists it. */
export interface StartupListing extends StartupProfile {
  /** Jobs it has open right now. */
  openJobs: number;
}

/** GET /profiles/startups */
export interface StartupDirectory {
  items: StartupListing[];
  total: number;
  limit: number;
  offset: number;
}

/** GET /profiles/specialists */
export interface SpecialistDirectory {
  items: SpecialistProfile[];
  total: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Jobs: startups post them, specialists apply
// ---------------------------------------------------------------------------

/** POST /jobs. Budget is in USDC. */
export interface JobInput {
  title: string;
  description: string;
  category: ServiceCategory;
  /** What the startup expects to receive at the end. */
  deliverables: string;
  budget: number;
  /** Calendar date, YYYY-MM-DD. */
  deadline: string;
  /** Rounds of changes the price includes. */
  revisionRounds?: number;
  /** Where the work is published or used, e.g. TikTok, LinkedIn. */
  channel?: string;
  /** Language of the content itself. */
  contentLanguage?: string;
  /** What the startup hands over: script, brand, logo, access. */
  startupProvides?: string;
  /** The payment plan. Each milestone says what it has to meet to be approved. */
  milestones: JobMilestoneInput[];
  /**
   * What the work will be measured on, up to 10. Every delivery reports a
   * result for each one.
   */
  kpis?: JobKpiInput[];
}

/** Something the work is measured on, e.g. { name: 'Qualified leads', target: '50 per month' }. */
export interface JobKpiInput {
  name: string;
  /** Free text, e.g. "50 per month". */
  target?: string;
  /** e.g. "leads", "%". */
  unit?: string;
}

export interface JobKpi {
  id: string;
  /** Order in which the startup listed it. */
  position: number;
  name: string;
  target: string | null;
  unit: string | null;
}

/** A milestone as the startup posts it with the job. */
export interface JobMilestoneInput {
  title: string;
  description: string;
  acceptanceCriteria: string;
  amount: number;
  /** Calendar date, YYYY-MM-DD. */
  dueDate: string;
}

export interface JobMilestone extends Omit<JobMilestoneInput, 'amount' | 'dueDate'> {
  id: string;
  position: number;
  /** USDC, serialized as a string to keep decimal precision. */
  amount: string;
  dueDate: IsoDate;
}

export interface Job {
  id: string;
  startupId: string;
  title: string;
  description: string;
  category: ServiceCategory;
  deliverables: string;
  /** USDC, serialized as a string to keep decimal precision. */
  budget: string;
  deadline: IsoDate;
  revisionRounds: number;
  channel?: string | null;
  contentLanguage?: string | null;
  startupProvides?: string | null;
  milestones: JobMilestone[];
  /** What the work is measured on. Empty when the startup set none. */
  kpis: JobKpi[];
  status: JobStatus;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/** A job as listed on the board, with who posted it. */
export interface JobListing extends Job {
  startup: { companyName: string; logoUrl?: string | null } | null;
  applicationCount: number;
}

/** GET /jobs */
export interface JobBoard {
  items: JobListing[];
  total: number;
  limit: number;
  offset: number;
}

/** POST /jobs/:id/applications. Price is in USDC and may differ from the budget. */
export interface ApplicationInput {
  /** How the specialist would do it. */
  approach: string;
  /** A piece of past work close to this job. */
  similarWorkUrl?: string;
  /** What they need from the startup to start. */
  needsFromStartup?: string;
  price: number;
  /** Days from the moment the escrow is funded. */
  estimatedDays: number;
}

export interface Application {
  id: string;
  jobId: string;
  specialistId: string;
  approach: string;
  similarWorkUrl?: string | null;
  needsFromStartup?: string | null;
  /** USDC, serialized as a string to keep decimal precision. */
  price: string;
  estimatedDays: number;
  status: ApplicationStatus;
  decidedAt?: IsoDate | null;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  /** The terms sent for this application, once the startup made an offer. */
  contract?: { id: string; status: ContractStatus } | null;
}

/** GET /jobs/:id/applications: what the startup sees about each applicant. */
export interface Applicant extends Application {
  specialist: Pick<SpecialistProfile, 'displayName' | 'headline' | 'avatarUrl'> | null;
}

/** GET /applications/mine: the specialist's applications with their job. */
export interface MyApplication extends Application {
  job: Pick<Job, 'id' | 'title' | 'category' | 'budget' | 'deadline' | 'status'>;
}

// ---------------------------------------------------------------------------
// Contracts, milestones and disputes
// ---------------------------------------------------------------------------

/** A transaction the API prepared for the user's wallet to sign. */
export interface PreparedTransaction {
  operationId: string;
  /** Unsigned transaction envelope, base64 XDR. */
  xdr: string;
  networkPassphrase: string;
}

/** POST /contracts: hire an applicant. Amounts are in USDC and add up to their price. */
export interface ContractInput {
  applicationId: string;
  milestones: {
    title: string;
    description: string;
    amount: number;
    /** Calendar date, YYYY-MM-DD. */
    dueDate: string;
  }[];
}

export interface Contract {
  id: string;
  jobId: string;
  applicationId: string;
  startupId: string;
  specialistId: string;
  /** USDC, serialized as a string. */
  amount: string;
  status: ContractStatus;
  /** Soroban contract id of the escrow, once deployed. */
  escrowId: string | null;
  acceptedAt: IsoDate | null;
  fundedAt: IsoDate | null;
  completedAt: IsoDate | null;
  cancelledAt: IsoDate | null;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface Milestone {
  id: string;
  contractId: string;
  /** Zero-based index inside the escrow. */
  position: number;
  title: string;
  description: string;
  /** What it has to meet to be approved, carried over from the job. */
  acceptanceCriteria?: string | null;
  amount: string;
  dueDate: IsoDate;
  status: MilestoneStatus;
  /** Rounds of changes already asked for on this milestone. */
  revisionsUsed: number;
  approvedAt: IsoDate | null;
  paidAt: IsoDate | null;
}

/** POST /milestones/:id/deliveries */
export interface DeliveryInput {
  /** Link to the work. */
  url: string;
  note?: string;
  /** One result for each KPI of the job. Required when the job has KPIs. */
  results?: KpiResultInput[];
}

/** What a delivery reports for one of the job's KPIs. */
export interface KpiResultInput {
  kpiId: string;
  /** Free text, short: "62", "48 of 50", "Not measurable yet". */
  value: string;
  comment?: string;
}

export interface KpiResult {
  id: string;
  deliverableId: string;
  kpiId: string;
  value: string;
  comment: string | null;
}

/** The types a delivery's file can be. Never SVG. */
export type AttachmentContentType =
  | 'application/pdf'
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp';

/**
 * The file backing a delivery's report, described. Its bytes are at
 * GET /deliverables/:id/attachment, for the contract's parties and managers.
 */
export interface DeliverableAttachment {
  contentType: AttachmentContentType;
  /** Bytes. */
  size: number;
  uploadedAt: IsoDate;
}

export interface Deliverable {
  id: string;
  milestoneId: string;
  version: number;
  url: string;
  note: string | null;
  /** What the startup asked to change on this version. */
  feedback: string | null;
  /** The result reported for each KPI of the job, empty when it has none. */
  kpiResults: KpiResult[];
  /** The file backing the report, if the specialist attached one. */
  attachment: DeliverableAttachment | null;
  createdAt: IsoDate;
}

export interface Dispute {
  id: string;
  milestoneId: string;
  openedById: string;
  reason: string;
  status: DisputeStatus;
  outcome: DisputeOutcome | null;
  specialistAmount: string | null;
  startupAmount: string | null;
  resolutionNote: string | null;
  resolvedById: string | null;
  resolvedAt: IsoDate | null;
  createdAt: IsoDate;
}

export interface DisputeEvidence {
  id: string;
  disputeId: string;
  authorId: string;
  url: string | null;
  comment: string;
  createdAt: IsoDate;
}

/** A confirmed on-chain step, with its hash for the explorer. */
export interface ChainOperation {
  id: string;
  kind: ChainOperationKind;
  txHash: string;
  amount: string | null;
  milestoneId: string | null;
  confirmedAt: IsoDate | null;
}

/** GET /contracts/mine */
export interface ContractSummary extends Contract {
  job: Pick<Job, 'id' | 'title' | 'category'>;
  milestones: Pick<Milestone, 'id' | 'position' | 'title' | 'amount' | 'status'>[];
}

/** GET /contracts/:id */
export interface ContractDetail extends Contract {
  job: Pick<
    Job,
    'id' | 'title' | 'category' | 'deadline' | 'status' | 'revisionRounds' | 'kpis'
  >;
  startup: {
    id: string;
    stellarAddress: string;
    startupProfile: { companyName: string; logoUrl: string | null } | null;
  };
  specialist: {
    id: string;
    stellarAddress: string;
    specialistProfile: { displayName: string; avatarUrl: string | null } | null;
  };
  milestones: (Milestone & { deliverables: Deliverable[]; disputes: Dispute[] })[];
  chainOperations: ChainOperation[];
  /** Each party's contact email, visible once there is a contract. */
  contacts: { startup: string | null; specialist: string | null };
}

/** GET /manager/disputes */
export interface DisputeListItem extends Dispute {
  milestone: {
    id: string;
    title: string;
    amount: string;
    contract: { id: string; job: { title: string } };
  };
}

/** GET /disputes/:id */
export interface DisputeDetail extends Dispute {
  milestone: Milestone & {
    contract: {
      id: string;
      startupId: string;
      specialistId: string;
      /** What the work is measured on, to read each delivery's report. */
      job: Pick<Job, 'kpis'>;
    };
    deliverables: Deliverable[];
  };
  evidence: (DisputeEvidence & { author: { id: string; role: UserRole } })[];
}

/** POST /manager/disputes/:id/resolve */
export interface DisputeResolution {
  outcome: DisputeOutcome;
  /** Split only: USDC the specialist receives. The startup gets the rest. */
  specialistAmount?: number;
  note: string;
}

// ---------------------------------------------------------------------------
// Manager metrics
// ---------------------------------------------------------------------------

/** Window the metrics dashboard looks at: the last 7, 30 or 90 days, or all time. */
export const MetricsPeriod = {
  Week: '7d',
  Month: '30d',
  Quarter: '90d',
  All: 'all',
} as const;
export type MetricsPeriod = (typeof MetricsPeriod)[keyof typeof MetricsPeriod];

/** One week of the 12-week series. Weeks start on Monday, 00:00 UTC. */
export interface MetricsWeek {
  weekStart: IsoDate;
  /** Startups and specialists who signed up that week. */
  newUsers: number;
  jobsPosted: number;
  /** USDC that came into escrow: contracts that became active that week. */
  funded: string;
  /** USDC paid to specialists: milestones released plus their dispute shares. */
  released: string;
}

/**
 * GET /manager/metrics?period=30d. "In the period" counts happened inside the
 * window; the others are the state right now. USDC amounts are decimal strings.
 */
export interface ManagerMetrics {
  period: MetricsPeriod;
  /** Start of the window, null for all time. */
  since: IsoDate | null;
  generatedAt: IsoDate;
  users: {
    startups: { total: number; newInPeriod: number };
    specialists: { total: number; newInPeriod: number };
    verification: {
      /** Requests waiting for a manager right now. */
      pending: number;
      /** Requests decided in the period. */
      approved: number;
      rejected: number;
      /** Median hours from submission to approval, for approvals in the period. */
      medianHoursToApprove: number | null;
    };
  };
  marketplace: {
    jobsPosted: number;
    /** Jobs open for applications right now. */
    openJobs: number;
    /** Applications sent in the period, to any job. */
    applications: number;
    /** Applications per job, over the jobs posted in the period. */
    averageApplicationsPerJob: number | null;
    offers: {
      sent: number;
      accepted: number;
      declined: number;
      /**
       * Always null for now: a withdrawn offer is deleted and leaves nothing
       * behind to count.
       */
      withdrawn: number | null;
      /** Offers waiting for the specialist's answer right now. */
      awaitingReply: number;
    };
    /** Median days from posting a job to its first accepted offer. */
    medianDaysToFirstHire: number | null;
  };
  money: {
    /** USDC that came into escrow: contracts that became active in the period. */
    funded: string;
    contractsFunded: number;
    /** Average amount of the contracts funded in the period. */
    averageContract: string | null;
    /** Paid to specialists, before Trustless Work's fee. */
    released: string;
    /** Returned to startups by resolved disputes. */
    refunded: string;
    /** Held right now by the escrows of active contracts. */
    inEscrow: string;
    /** POCKET_FEE_PERCENT of what was released in the period. */
    pocketFee: string;
  };
  health: {
    openDisputes: number;
    disputesResolved: number;
    /** Milestones of active contracts past their due date and not yet approved. */
    overdueMilestones: number;
    /** Contracts accepted more than 3 days ago and still not funded. */
    staleAwaitingFunding: number;
  };
  /** The last 12 weeks, oldest first, the current week last. */
  weekly: MetricsWeek[];
}
