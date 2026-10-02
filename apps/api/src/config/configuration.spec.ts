import { validateEnv } from './configuration';

/** Everything the API needs on testnet. */
const TESTNET_ENV = {
  DATABASE_URL: 'postgres://db',
  DIRECT_URL: 'postgres://db',
  JWT_SECRET: 'x'.repeat(48),
  TRUSTLESS_WORK_API_URL: 'https://dev.api.trustlesswork.com',
  TRUSTLESS_WORK_API_KEY: 'key',
  USDC_ISSUER: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  STELLAR_PLATFORM_SECRET: 'S...',
  TRUSTLESS_WORK_DEPLOYER_CONTRACT_ID: 'CDEPLOYER',
  TRUSTLESS_WORK_FEE_ADDRESS: 'GA6KH5VWPCHBOEF63X57SPX6T4H366YFFKKGCVDBTXT2N7JVL6PJCK7G',
  TRUSTLESS_WORK_ESCROW_WASM_HASH: 'ab'.repeat(32),
};

/** The same on mainnet: its RPC and USDC, and no fee address. */
const MAINNET_ENV = {
  ...TESTNET_ENV,
  STELLAR_NETWORK: 'mainnet',
  SOROBAN_RPC_URL: 'https://rpc.example',
  USDC_ISSUER: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  TRUSTLESS_WORK_FEE_ADDRESS: undefined,
};

describe('validateEnv', () => {
  it('accepts a complete testnet setup', () => {
    expect(() => validateEnv(TESTNET_ENV)).not.toThrow();
  });

  it("requires Trustless Work's fee address on testnet, where calls name it", () => {
    expect(() =>
      validateEnv({ ...TESTNET_ENV, TRUSTLESS_WORK_FEE_ADDRESS: undefined }),
    ).toThrow('TRUSTLESS_WORK_FEE_ADDRESS');
  });

  it('does not need the fee address on mainnet, where the contract has it', () => {
    expect(() => validateEnv(MAINNET_ENV)).not.toThrow();
  });

  it("refuses the other network's USDC", () => {
    expect(() =>
      validateEnv({ ...MAINNET_ENV, USDC_ISSUER: TESTNET_ENV.USDC_ISSUER }),
    ).toThrow('USDC_ISSUER is the testnet issuer, but STELLAR_NETWORK is mainnet');
    expect(() =>
      validateEnv({ ...TESTNET_ENV, USDC_ISSUER: MAINNET_ENV.USDC_ISSUER }),
    ).toThrow('USDC_ISSUER is the mainnet issuer, but STELLAR_NETWORK is testnet');
  });

  it('still needs its own RPC on mainnet', () => {
    expect(() => validateEnv({ ...MAINNET_ENV, SOROBAN_RPC_URL: undefined })).toThrow(
      'SOROBAN_RPC_URL',
    );
  });
});
