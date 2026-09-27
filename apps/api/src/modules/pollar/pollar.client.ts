import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** What Pollar tells us about the user behind an access token. */
export interface PollarSession {
  /** Pollar's user id. */
  userId: string;
  /** The wallet's on-chain address. */
  stellarAddress: string;
  /** How the address is held: Pollar's own key, or the user's wallet. */
  custody: 'internal' | 'external' | 'smart';
  /** google, github, email, freighter-native... */
  provider?: string;
  email?: string;
  /** Whether the wallet already exists and is funded on Stellar. */
  funded: boolean;
  network: string;
}

/** Answer of a funding request. `alreadyFunded` means there was nothing to do. */
export interface PollarFunding {
  alreadyFunded: boolean;
  startingBalance?: string;
}

interface PollarEnvelope<T> {
  content?: T;
  code?: string;
  success?: boolean;
}

interface VerifiedToken {
  userId?: string;
  applicationId?: string;
  expiresAt?: string;
  network?: string;
  wallet?: {
    publicKey?: string;
    address?: string;
    custody?: string;
    status?: string;
    existsOnStellar?: boolean;
    fundedAt?: string | null;
  } | null;
  profile?: { email?: string; firstName?: string; lastName?: string } | null;
  authProvider?: string;
}

/**
 * Server side of Pollar. Two jobs, both with the secret key and never from the
 * browser: turn an SDK access token into the user behind it, and put the XLM
 * reserve on a wallet once Pocket decides the account is real.
 *
 * Endpoints and payloads follow https://docs.pollar.xyz/docs/sdk-reference/server-api.
 */
@Injectable()
export class PollarClient {
  private readonly logger = new Logger(PollarClient.name);
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly network: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('pollar.serverUrl');
    this.secretKey = config.get<string>('pollar.secretKey') ?? '';
    this.network = config.get<string>('stellar.network') ?? 'testnet';
  }

  /** False when no secret key is set: Pollar logins are simply not offered. */
  get enabled(): boolean {
    return this.secretKey.length > 0;
  }

  /**
   * Check an access token minted by the Pollar SDK in the browser. A token that
   * is expired, invalid or from another Pollar app cannot sign anybody in.
   */
  async verifyToken(token: string): Promise<PollarSession> {
    const { payload, status } = await this.post<VerifiedToken>('/v1/tokens/verify', {
      token,
    });
    if (status === 401 || status === 403) {
      throw new UnauthorizedException('Your Pollar session expired. Sign in again');
    }
    if (status >= 400 || !payload.success) {
      this.logger.error(`/v1/tokens/verify -> ${status}: ${payload.code ?? 'no code'}`);
      throw new ServiceUnavailableException('Pollar could not confirm your session');
    }

    const content = payload.content ?? {};
    const address = content.wallet?.address ?? content.wallet?.publicKey;
    if (!content.userId || !address) {
      throw new ServiceUnavailableException(
        'Pollar confirmed the session but sent no wallet',
      );
    }
    const network = content.network?.toLowerCase() ?? this.network;
    if (network !== this.network) {
      // A Pollar key belongs to one network, so this means the keys and the API
      // point at different chains: the addresses would not even exist.
      this.logger.error(`Pollar session is on ${network}, Pocket is on ${this.network}`);
      throw new ServiceUnavailableException(
        'Pollar and Pocket are configured for different Stellar networks',
      );
    }
    return {
      userId: content.userId,
      stellarAddress: address,
      custody: custodyOf(content.wallet?.custody),
      provider: content.authProvider,
      email: content.profile?.email,
      funded: content.wallet?.existsOnStellar ?? Boolean(content.wallet?.fundedAt),
      network,
    };
  }

  /**
   * Put the XLM reserve on a Pollar wallet. Deferred funding: Pocket pays for a
   * wallet once a manager approves the account, not for every visitor who logs
   * in. A wallet that was already funded answers 409, which is the same outcome.
   */
  async fundWallet(stellarAddress: string): Promise<PollarFunding> {
    const { payload, status } = await this.post<{ startingBalance?: string }>(
      '/v1/wallets/fund',
      { publicKey: stellarAddress },
    );
    if (status === 409) return { alreadyFunded: true };
    if (status >= 400 || !payload.success) {
      this.logger.error(`/v1/wallets/fund -> ${status}: ${payload.code ?? 'no code'}`);
      throw new ServiceUnavailableException(
        `Pollar could not fund the wallet: ${payload.code ?? status}`,
      );
    }
    return {
      alreadyFunded: false,
      startingBalance: payload.content?.startingBalance,
    };
  }

  /**
   * The status is returned instead of thrown: every caller here treats some
   * error status as an outcome of its own.
   */
  private async post<T>(
    path: string,
    body: unknown,
  ): Promise<{ payload: PollarEnvelope<T>; status: number }> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-pollar-api-key': this.secretKey,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      this.logger.error(`POST ${path} failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Pollar is unreachable right now');
    }
    // An error body can be empty, and a failed parse must not hide the status.
    const parsed: unknown = await response.json().catch(() => ({}));
    const payload = (parsed ?? {}) as PollarEnvelope<T>;
    return { payload, status: response.status };
  }
}

/** Pollar reports `internal` for the wallets it keeps, `smart` for passkeys. */
function custodyOf(custody: string | undefined): PollarSession['custody'] {
  return custody === 'external' || custody === 'smart' ? custody : 'internal';
}
