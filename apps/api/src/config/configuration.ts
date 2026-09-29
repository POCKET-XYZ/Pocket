export type StellarNetwork = 'testnet' | 'mainnet';

export interface AppConfig {
  port: number;
  corsOrigins: string[];
  database: { url: string };
  jwt: { secret: string; expiresIn: string };
  stellar: {
    network: StellarNetwork;
    horizonUrl: string;
    usdcIssuer: string;
    /** Signs the escrow deploy and the platform roles: release and dispute resolution. */
    platformSecret: string;
  };
  trustlessWork: {
    apiUrl: string;
    apiKey: string;
    /** Trustless Work's contract that deploys escrows on this network. */
    deployerContractId: string;
    /** Where Trustless Work's protocol fee goes on this network. */
    feeAddress: string;
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
  'TRUSTLESS_WORK_FEE_ADDRESS',
] as const;

/** Pollar's backend API. Secret-key routes only. */
const DEFAULT_POLLAR_SERVER = 'https://server.api.pollar.xyz';

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
  const network = env.STELLAR_NETWORK ?? 'testnet';
  if (network !== 'testnet' && network !== 'mainnet') {
    throw new Error('STELLAR_NETWORK must be "testnet" or "mainnet"');
  }
  return env;
}

export default (): AppConfig => {
  const network =
    (process.env.STELLAR_NETWORK as StellarNetwork | undefined) ?? 'testnet';
  return {
    port: Number(process.env.PORT ?? 3000),
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3001')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    database: { url: process.env.DATABASE_URL as string },
    jwt: {
      secret: process.env.JWT_SECRET as string,
      expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    },
    stellar: {
      network,
      horizonUrl: process.env.HORIZON_URL ?? DEFAULT_HORIZON[network],
      usdcIssuer: process.env.USDC_ISSUER as string,
      platformSecret: process.env.STELLAR_PLATFORM_SECRET as string,
    },
    trustlessWork: {
      apiUrl: (process.env.TRUSTLESS_WORK_API_URL as string).replace(/\/+$/, ''),
      apiKey: process.env.TRUSTLESS_WORK_API_KEY as string,
      deployerContractId: process.env.TRUSTLESS_WORK_DEPLOYER_CONTRACT_ID as string,
      feeAddress: process.env.TRUSTLESS_WORK_FEE_ADDRESS as string,
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
