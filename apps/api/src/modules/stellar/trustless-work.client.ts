import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimiter } from '../../common/rate-limit/rate-limiter';

/** Roles of a multi-release escrow. Every role is a Stellar address. */
export interface EscrowRoles {
  approver: string;
  serviceProvider: string;
  platformAddress: string;
  releaseSigner: string;
  disputeResolver: string;
}

export interface EscrowMilestoneInput {
  description: string;
  /** USDC. */
  amount: number;
  receiver: string;
}

export interface DeployEscrowInput {
  signer: string;
  engagementId: string;
  title: string;
  description: string;
  roles: EscrowRoles;
  /**
   * Pocket's commission, kept by the escrow from each payout and sent to the
   * platform address. See TW_API_PLATFORM_FEE for the unit.
   */
  platformFee: number;
  milestones: EscrowMilestoneInput[];
  trustline: { address: string; symbol: string };
}

/** One share of a resolved dispute. Trustless Work rejects amounts <= 0. */
export interface Distribution {
  address: string;
  amount: number;
}

export interface EscrowMilestoneState {
  description: string;
  amount: number;
  status: string;
  receiver?: string;
  flags?: {
    approved?: boolean;
    released?: boolean;
    disputed?: boolean;
    resolved?: boolean;
  };
}

/** An escrow as Trustless Work reports it. */
export interface EscrowState {
  contractId: string;
  balance: number;
  milestones: EscrowMilestoneState[];
  roles: Partial<EscrowRoles>;
}

/**
 * Thin client for the Trustless Work REST API. Every write endpoint returns an
 * unsigned transaction; whoever holds the role signs it and it is broadcast
 * through `send`.
 *
 * Endpoints and bodies follow https://dev.api.trustlesswork.com/docs-json.
 * Milestone indexes go as strings and amounts as numbers, as the API expects.
 */
@Injectable()
export class TrustlessWorkClient {
  private readonly logger = new Logger(TrustlessWorkClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  /** The contract that deploys escrows, which a deploy must call. */
  readonly deployerContractId: string;
  /**
   * Where the protocol fee goes, which a testnet release or resolution must
   * name. Unset on mainnet, where the contract has it written in.
   */
  readonly feeAddress: string | undefined;
  /** The escrow code a deploy must install, as a hex hash. */
  readonly escrowWasmHash: string;
  /**
   * Pocket's own budget, below Trustless Work's 50 requests a minute. The per
   * user limits keep one person from spending it; this keeps everyone together
   * from reaching the provider's limit, where every step would start failing.
   */
  private readonly budget = new RateLimiter();

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('trustlessWork.apiUrl');
    this.apiKey = config.getOrThrow<string>('trustlessWork.apiKey');
    this.deployerContractId = config.getOrThrow<string>('trustlessWork.deployerContractId');
    // Required on testnet by validateEnv; the policies refuse a testnet call
    // whose fee address does not match, so a missing one cannot slip through.
    this.feeAddress = config.get<string>('trustlessWork.feeAddress') || undefined;
    this.escrowWasmHash = config.getOrThrow<string>('trustlessWork.escrowWasmHash');
  }

  deployMultiRelease(input: DeployEscrowInput): Promise<string> {
    return this.unsigned('/deployer/multi-release', input);
  }

  fund(contractId: string, signer: string, amount: number): Promise<string> {
    return this.unsigned('/escrow/multi-release/fund-escrow', {
      contractId,
      signer,
      amount,
    });
  }

  approve(contractId: string, milestoneIndex: number, approver: string): Promise<string> {
    return this.unsigned('/escrow/multi-release/approve-milestone', {
      contractId,
      milestoneIndex: String(milestoneIndex),
      approver,
    });
  }

  release(
    contractId: string,
    milestoneIndex: number,
    releaseSigner: string,
  ): Promise<string> {
    return this.unsigned('/escrow/multi-release/release-milestone-funds', {
      contractId,
      milestoneIndex: String(milestoneIndex),
      releaseSigner,
    });
  }

  dispute(contractId: string, milestoneIndex: number, signer: string): Promise<string> {
    return this.unsigned('/escrow/multi-release/dispute-milestone', {
      contractId,
      milestoneIndex: String(milestoneIndex),
      signer,
    });
  }

  resolve(
    contractId: string,
    milestoneIndex: number,
    disputeResolver: string,
    distributions: Distribution[],
  ): Promise<string> {
    return this.unsigned('/escrow/multi-release/resolve-milestone-dispute', {
      contractId,
      milestoneIndex: String(milestoneIndex),
      disputeResolver,
      distributions,
    });
  }

  /** Broadcast a signed transaction. Returns the deployed contract id, if any. */
  async send(signedXdr: string): Promise<{ contractId?: string }> {
    const result = await this.request<{
      status?: string;
      message?: string;
      contractId?: string;
    }>('POST', '/helper/send-transaction', { signedXdr });
    // Only an explicit SUCCESS counts; an answer without a status is not one.
    if (result.status !== 'SUCCESS') {
      this.logger.error(
        `POST /helper/send-transaction -> ${result.status}: ${result.message ?? ''}`,
      );
      throw publicError(result.message);
    }
    return { contractId: result.contractId };
  }

  /** Current state of an escrow, read from the chain rather than the indexer. */
  async getEscrow(contractId: string): Promise<EscrowState | null> {
    // The API only reads contractIds as an array when the key has brackets.
    const query = `contractIds[]=${encodeURIComponent(contractId)}&validateOnChain=true`;
    const result = await this.request<EscrowState[]>(
      'GET',
      `/helper/get-escrow-by-contract-ids?${query}`,
    );
    return result.find((escrow) => escrow.contractId === contractId) ?? null;
  }

  private async unsigned(path: string, body: unknown): Promise<string> {
    const { unsignedTransaction } = await this.request<{ unsignedTransaction?: string }>(
      'POST',
      path,
      body,
    );
    if (!unsignedTransaction) {
      throw new ServiceUnavailableException(
        `Trustless Work returned no transaction for ${path}`,
      );
    }
    return unsignedTransaction;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await this.fetchWithRetry(method, path, body);
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      this.logger.error(
        `${method} ${path} -> ${response.status}: ${JSON.stringify(payload)}`,
      );
      throw publicError(typeof payload.message === 'string' ? payload.message : undefined);
    }
    return payload as T;
  }

  /**
   * Trustless Work allows 50 requests per minute per API key and answers 429
   * past that. A rejected request was not processed, so it is safe to send it
   * again, sending included: wait what the server asks (Retry-After) or back
   * off, and give up after a few tries with a clear message.
   */
  private async fetchWithRetry(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      if (this.budget.take('trustless-work', TRUSTLESS_WORK_BUDGET_PER_MINUTE, 60_000) > 0) {
        this.logger.warn(`${method} ${path} held back: Pocket's Trustless Work budget is spent`);
        throw new ServiceUnavailableException(
          'Trustless Work is busy right now. Try again in a minute',
        );
      }
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.status !== 429) return response;
      if (attempt >= RATE_LIMIT_RETRIES) {
        this.logger.error(`${method} ${path} -> 429 after ${attempt + 1} tries`);
        throw new ServiceUnavailableException(
          'Trustless Work is busy right now. Try again in a minute',
        );
      }
      const waitMs = retryDelayMs(response.headers.get('retry-after'), attempt);
      this.logger.warn(`${method} ${path} -> 429, retrying in ${waitMs} ms`);
      await this.sleep(waitMs);
    }
  }

  /** Separate so tests do not have to wait. */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/** Requests a minute Pocket allows itself, under Trustless Work's 50. */
export const TRUSTLESS_WORK_BUDGET_PER_MINUTE = 40;

/** Retries after a 429 before giving up. */
const RATE_LIMIT_RETRIES = 3;
/** Never wait longer than this for one retry, whatever the server says. */
const MAX_RETRY_DELAY_MS = 20_000;

/** Wait what Retry-After asks (seconds), or 1, 2 and 4 seconds when it is absent. */
export function retryDelayMs(retryAfter: string | null, attempt: number): number {
  const seconds = Number(retryAfter);
  const delay =
    retryAfter !== null && Number.isFinite(seconds) && seconds >= 0
      ? seconds * 1000
      : 1000 * 2 ** attempt;
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

/**
 * What the user reads when Trustless Work refuses a step. Its own text can
 * carry contract internals and addresses, so it only goes to the log; the
 * cases a user can act on get a fixed sentence of Pocket's.
 */
const KNOWN_ERRORS: [RegExp, string][] = [
  [/already in dispute/i, 'This milestone is already in dispute'],
  [/insufficient|not enough|underfunded/i, 'The wallet does not have enough funds for this step'],
  [/trustline/i, 'The wallet needs to accept USDC before this step'],
  [/not found/i, 'This escrow was not found on Stellar'],
];

function publicError(message: string | undefined): HttpException {
  const known = message && KNOWN_ERRORS.find(([pattern]) => pattern.test(message));
  // The original text rides along as the cause, for the operation log.
  const options = message ? { cause: new Error(message) } : undefined;
  return known
    ? new BadRequestException(known[1], options)
    : new ServiceUnavailableException(
        'The escrow service could not complete this step. Try again',
        options,
      );
}
