export type StellarNetwork = 'testnet' | 'mainnet';

export interface AppConfig {
  port: number;
  /** Public address of the API with its /api prefix, for links it hands out. */
  apiPublicUrl: string;
  /** Proxies in front of the API: 0 locally, 1 behind Railway or Render. */
  trustProxyHops: number;
  corsOrigins: string[];
  database: { url: string };
  jwt: { secret: string; expiresIn: string };
  stellar: {
    network: StellarNetwork;
    horizonUrl: string;
    usdcIssuer: string;
    /** Signs the escrow deploy and the platform roles: release and dispute resolution. */
    platformSecret: string;
    /** Below this much XLM for fees the platform account raises an alert. */
    platformMinXlm: number;
    /** Soroban RPC node escrows and transactions are read from. */
    sorobanRpcUrl: string;
  };
  trustlessWork: {
    apiUrl: string;
    apiKey: string;
    /** Trustless Work's contract that deploys escrows on this network. */
    deployerContractId: string;
    /**
     * Where Trustless Work's protocol fee goes. Testnet calls carry it; the
     * mainnet contract has it written in, so it is unset there.
     */
    feeAddress: string | undefined;
    /** Hash of the escrow code Trustless Work deploys; nothing else is deployed. */
    escrowWasmHash: string;
  };
  /** Wallets and logins for users without a Stellar wallet of their own. */
  pollar: { serverUrl: string; secretKey: string };
}

const REQUIRED = [
  'DATABASE_URL',
  'DIRECT_URL',
  'JWT_SECRET',
  'TRUSTLESS_WORK_API_URL',
  'TRUSTLESS_WORK_API_KEY',
  'USDC_ISSUER',
  'STELLAR_PLATFORM_SECRET',
  // What every platform signature is checked against: without them the
  // platform key would sign whatever Trustless Work sends.
  'TRUSTLESS_WORK_DEPLOYER_CONTRACT_ID',
  'TRUSTLESS_WORK_ESCROW_WASM_HASH',
] as const;

/**
 * Required on testnet only: there releases and resolutions name Trustless
 * Work's fee address and the platform checks it. On mainnet the contract has
 * it written in and the calls do not carry it.
 */
const REQUIRED_ON_TESTNET = ['TRUSTLESS_WORK_FEE_ADDRESS'] as const;

/** Circle's USDC issuer on each network. */
export const USDC_ISSUERS: Record<StellarNetwork, string> = {
  testnet: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  mainnet: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
};
/** Pollar's backend API. Secret-key routes only. */
const DEFAULT_POLLAR_SERVER = 'https://server.api.pollar.xyz';

/** SDF's public RPC exists on testnet only; mainnet needs a provider. */
const DEFAULT_SOROBAN_RPC = 'https://soroban-testnet.stellar.org';

const DEFAULT_HORIZON: Record<StellarNetwork, string> = {
  testnet: 'https://horizon-testnet.stellar.org',
  mainnet: 'https://horizon.stellar.org',
};

/** Fail fast at boot when a required variable is missing. */
export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const missing = REQUIRED.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  // Anyone who knows the secret can sign themselves in as anybody, manager
  // included: refuse to start with a short one or the example's placeholder.
  const jwtSecret = String(env.JWT_SECRET);
  if (jwtSecret.length < 32 || jwtSecret === 'change-me') {
    throw new Error('JWT_SECRET must be a random value of at least 32 characters');
  }
  const network = env.STELLAR_NETWORK ?? 'testnet';
  if (network !== 'testnet' && network !== 'mainnet') {
    throw new Error('STELLAR_NETWORK must be "testnet" or "mainnet"');
  }
  if (network === 'testnet') {
    const missingOnTestnet = REQUIRED_ON_TESTNET.filter((key) => !env[key]);
    if (missingOnTestnet.length > 0) {
      throw new Error(
        `Missing required environment variables on testnet: ${missingOnTestnet.join(', ')}`,
      );
    }
  }
  if (network === 'mainnet' && !env.SOROBAN_RPC_URL) {
    throw new Error('SOROBAN_RPC_URL is required on mainnet');
  }
  // The other network's USDC is another asset: escrows would hold it and users
  // would be asked to trust it. A known issuer of the wrong network is always a
  // configuration mistake.
  const otherNetwork: StellarNetwork = network === 'mainnet' ? 'testnet' : 'mainnet';
  if (env.USDC_ISSUER === USDC_ISSUERS[otherNetwork]) {
    throw new Error(
      `USDC_ISSUER is the ${otherNetwork} issuer, but STELLAR_NETWORK is ${network}`,
    );
  }  if (!/^[0-9a-f]{64}$/.test(String(env.TRUSTLESS_WORK_ESCROW_WASM_HASH))) {
    throw new Error('TRUSTLESS_WORK_ESCROW_WASM_HASH must be 64 hex characters');
  }
  return env;
}

export default (): AppConfig => {
  const network =
    (process.env.STELLAR_NETWORK as StellarNetwork | undefined) ?? 'testnet';
  return {
    port: Number(process.env.PORT ?? 3000),
    apiPublicUrl: (process.env.API_PUBLIC_URL ?? '').replace(/\/+$/, ''),
    trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 0),
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3001')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    database: { url: process.env.DATABASE_URL as string },
    jwt: {
      secret: process.env.JWT_SECRET as string,
      // Short enough that a stolen token does not buy a week of access.
      expiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
    },
    stellar: {
      network,
      horizonUrl: process.env.HORIZON_URL ?? DEFAULT_HORIZON[network],
      usdcIssuer: process.env.USDC_ISSUER as string,
      platformSecret: process.env.STELLAR_PLATFORM_SECRET as string,
      platformMinXlm: Number(process.env.PLATFORM_MIN_XLM ?? 20),
      sorobanRpcUrl: process.env.SOROBAN_RPC_URL || DEFAULT_SOROBAN_RPC,
    },
    trustlessWork: {
      apiUrl: (process.env.TRUSTLESS_WORK_API_URL as string).replace(/\/+$/, ''),
      apiKey: process.env.TRUSTLESS_WORK_API_KEY as string,
      deployerContractId: process.env.TRUSTLESS_WORK_DEPLOYER_CONTRACT_ID as string,
      feeAddress: process.env.TRUSTLESS_WORK_FEE_ADDRESS || undefined,
      escrowWasmHash: process.env.TRUSTLESS_WORK_ESCROW_WASM_HASH as string,
    },
    pollar: {
      serverUrl: (process.env.POLLAR_SERVER_URL ?? DEFAULT_POLLAR_SERVER).replace(
        /\/+$/,
        '',
      ),
      // Optional: without it Pocket only accepts wallet sign-ins.
      secretKey: process.env.POLLAR_SECRET_KEY ?? '',
    },
  };
};
