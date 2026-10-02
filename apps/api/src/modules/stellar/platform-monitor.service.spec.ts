import type { ConfigService } from '@nestjs/config';
import * as log from '../../common/security/security-log';
import type { PrismaService } from '../../prisma/prisma.service';
import { PlatformMonitorService } from './platform-monitor.service';
import type { StellarService } from './stellar.service';

const PLATFORM = 'GD6GR4SHFZENIND6EIU2M4MTWNNHOGL6JC6ZUYWBPVPQUG7XDXED3FNO';
const OTHER = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

/** A Horizon stand-in that serves `pages` of operations in order. */
function fakeHorizon(pages: object[][], xlm = '100', trustsUsdc = true) {
  const queue = [...pages];
  const builder = {
    forAccount: () => builder,
    order: () => builder,
    limit: () => builder,
    cursor: () => builder,
    call: jest.fn(() => Promise.resolve({ records: queue.shift() ?? [] })),
  };
  return {
    operations: () => builder,
    loadAccount: jest.fn(() =>
      Promise.resolve({
        balances: [
          { asset_type: 'native', balance: xlm },
          ...(trustsUsdc
            ? [
                {
                  asset_type: 'credit_alphanum4',
                  asset_code: 'USDC',
                  asset_issuer: USDC_ISSUER,
                  balance: '12.5',
                },
              ]
            : []),
        ],
      }),
    ),
  };
}

const op = (token: string, txHash: string, source = PLATFORM) => ({
  paging_token: token,
  transaction_hash: txHash,
  source_account: source,
  type: 'invoke_host_function',
  created_at: '2026-09-29T00:00:00Z',
});

describe('PlatformMonitorService', () => {
  let prisma: { chainOperation: { findUnique: jest.Mock } };
  let alerts: jest.SpyInstance;

  function monitor(horizon: object) {
    const config = { getOrThrow: () => 'https://horizon', get: () => 20 };
    const service = new PlatformMonitorService(
      config as unknown as ConfigService,
      prisma as unknown as PrismaService,
      { platformAddress: PLATFORM, usdcIssuer: USDC_ISSUER } as unknown as StellarService,
    );
    (service as unknown as { horizon: object }).horizon = horizon;
    return service;
  }

  beforeEach(() => {
    prisma = {
      chainOperation: {
        findUnique: jest.fn(({ where }: { where: { txHash: string } }) =>
          Promise.resolve(where.txHash === 'recorded' ? { id: 'op-1' } : null),
        ),
      },
    };
    alerts = jest.spyOn(log, 'securityEvent').mockImplementation(() => undefined);
  });
  afterEach(() => alerts.mockRestore());

  it('starts from where the history ends today, without alerting on the past', async () => {
    const service = monitor(fakeHorizon([[op('1', 'old-unrecorded')]]));
    await expect(service.checkOperations()).resolves.toBe(0);
    expect(alerts).not.toHaveBeenCalled();
  });

  it('alerts on a transaction of the platform that Pocket never recorded', async () => {
    const service = monitor(
      fakeHorizon([
        [op('1', 'recorded')],
        [op('2', 'recorded'), op('3', 'stolen-key'), op('4', 'gift', OTHER)],
      ]),
    );
    await service.checkOperations();
    await expect(service.checkOperations()).resolves.toBe(1);
    expect(alerts).toHaveBeenCalledTimes(1);
    expect(alerts).toHaveBeenCalledWith(
      'unrecorded_platform_operation',
      expect.objectContaining({ txHash: 'stolen-key' }),
      'alert',
    );
  });

  it('alerts once when the XLM for fees runs low', async () => {
    const service = monitor(fakeHorizon([], '5.5'));
    await expect(service.checkBalance()).resolves.toBe(5.5);
    await service.checkBalance();
    expect(alerts).toHaveBeenCalledTimes(1);
    expect(alerts).toHaveBeenCalledWith(
      'platform_balance_low',
      expect.objectContaining({ xlm: 5.5, threshold: 20 }),
      'alert',
    );
  });

  it('stays quiet while the balance is healthy', async () => {
    await monitor(fakeHorizon([], '250')).checkBalance();
    expect(alerts).not.toHaveBeenCalled();
  });

  it("alerts once when the account cannot receive Pocket's fee in USDC", async () => {
    const service = monitor(fakeHorizon([], '250', false));
    await service.checkBalance();
    await service.checkBalance();
    expect(alerts).toHaveBeenCalledTimes(1);
    expect(alerts).toHaveBeenCalledWith(
      'platform_usdc_trustline_missing',
      expect.objectContaining({ account: PLATFORM, issuer: USDC_ISSUER }),
      'alert',
    );
  });
});
