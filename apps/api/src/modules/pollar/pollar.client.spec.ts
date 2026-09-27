import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PollarClient } from './pollar.client';

const SECRET = 'sec_testnet_0123456789';
const ADDRESS = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';

function config(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    'pollar.serverUrl': 'https://server.api.pollar.xyz',
    'pollar.secretKey': SECRET,
    'stellar.network': 'testnet',
    ...overrides,
  };
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => values[key],
  } as unknown as ConfigService;
}

/** One fetch answer, as Pollar's envelope. */
function answer(status: number, body: unknown): Response {
  return { status, json: () => Promise.resolve(body) } as unknown as Response;
}

describe('PollarClient', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('is disabled without a secret key, so only wallet sign-in is offered', () => {
    expect(new PollarClient(config({ 'pollar.secretKey': '' })).enabled).toBe(false);
    expect(new PollarClient(config()).enabled).toBe(true);
  });

  it('sends the secret key in the header Pollar expects', async () => {
    fetchMock.mockResolvedValue(
      answer(200, {
        success: true,
        content: {
          userId: 'usr_1',
          network: 'testnet',
          wallet: { address: ADDRESS, custody: 'internal', existsOnStellar: true },
          profile: { email: 'a@example.com' },
          authProvider: 'google',
        },
      }),
    );

    const session = await new PollarClient(config()).verifyToken('token');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://server.api.pollar.xyz/v1/tokens/verify');
    expect((init.headers as Record<string, string>)['x-pollar-api-key']).toBe(SECRET);
    expect(session).toEqual({
      userId: 'usr_1',
      stellarAddress: ADDRESS,
      custody: 'internal',
      provider: 'google',
      email: 'a@example.com',
      funded: true,
      network: 'testnet',
    });
  });

  it('reads the public key when the wallet has no address field', async () => {
    fetchMock.mockResolvedValue(
      answer(200, {
        success: true,
        content: { userId: 'usr_1', wallet: { publicKey: ADDRESS }, network: 'testnet' },
      }),
    );
    const session = await new PollarClient(config()).verifyToken('token');
    expect(session.stellarAddress).toBe(ADDRESS);
    // Pollar reports `internal` for the wallets it holds; anything unknown is treated the same.
    expect(session.custody).toBe('internal');
  });

  it('turns an expired session into an unauthorized error', async () => {
    fetchMock.mockResolvedValue(answer(401, { code: 'SDK_AUTH_TOKEN_EXPIRED' }));
    await expect(new PollarClient(config()).verifyToken('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a session from another network', async () => {
    fetchMock.mockResolvedValue(
      answer(200, {
        success: true,
        content: { userId: 'usr_1', wallet: { address: ADDRESS }, network: 'mainnet' },
      }),
    );
    await expect(new PollarClient(config()).verifyToken('token')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('refuses a confirmed session that carries no wallet', async () => {
    fetchMock.mockResolvedValue(
      answer(200, { success: true, content: { userId: 'usr_1', wallet: null } }),
    );
    await expect(new PollarClient(config()).verifyToken('token')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('treats a wallet that was already funded as funded', async () => {
    fetchMock.mockResolvedValue(answer(409, { code: 'WALLET_ALREADY_FUNDED' }));
    await expect(new PollarClient(config()).fundWallet(ADDRESS)).resolves.toEqual({
      alreadyFunded: true,
    });
  });

  it('reports the starting balance of a wallet it just funded', async () => {
    fetchMock.mockResolvedValue(
      answer(200, {
        success: true,
        code: 'SERVER_WALLET_FUNDED',
        content: { publicKey: ADDRESS, startingBalance: '1' },
      }),
    );
    await expect(new PollarClient(config()).fundWallet(ADDRESS)).resolves.toEqual({
      alreadyFunded: false,
      startingBalance: '1',
    });
  });

  it('fails clearly when the funding wallet has no XLM left', async () => {
    fetchMock.mockResolvedValue(answer(502, { code: 'FUND_XLM_FAILED' }));
    await expect(new PollarClient(config()).fundWallet(ADDRESS)).rejects.toThrow(
      /FUND_XLM_FAILED/,
    );
  });

  it('says Pollar is unreachable instead of leaking a network error', async () => {
    fetchMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    await expect(new PollarClient(config()).verifyToken('token')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
