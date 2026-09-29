import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  retryDelayMs,
  TRUSTLESS_WORK_BUDGET_PER_MINUTE,
  TrustlessWorkClient,
} from './trustless-work.client';

/** The client with an instant sleep, recording how long it was asked to wait. */
class TestClient extends TrustlessWorkClient {
  waits: number[] = [];
  protected sleep(ms: number): Promise<void> {
    this.waits.push(ms);
    return Promise.resolve();
  }
}

function reply(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

describe('TrustlessWorkClient', () => {
  const config = new ConfigService({
    trustlessWork: {
      apiUrl: 'https://tw.test',
      apiKey: 'key-1',
      deployerContractId: 'CDEPLOYER',
      feeAddress: 'GTWFEE',
      escrowWasmHash: 'ab'.repeat(32),
    },
  });
  let fetchMock: jest.SpyInstance;
  let client: TestClient;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
    client = new TestClient(config);
  });

  afterEach(() => fetchMock.mockRestore());

  it('sends the API key in the x-api-key header', async () => {
    fetchMock.mockResolvedValue(reply(200, { unsignedTransaction: 'AAAA' }));
    await client.fund('CESCROW', 'GSTARTUP', 10);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tw.test/escrow/multi-release/fund-escrow',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'key-1' }) as unknown,
      }),
    );
  });

  it('retries after a 429 and returns the answer that follows', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(429))
      .mockResolvedValueOnce(reply(200, { unsignedTransaction: 'AAAA' }));

    await expect(client.fund('CESCROW', 'GSTARTUP', 10)).resolves.toBe('AAAA');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(client.waits).toEqual([1000]);
  });

  it('waits what Retry-After asks for', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(429, {}, { 'retry-after': '3' }))
      .mockResolvedValueOnce(reply(200, { unsignedTransaction: 'AAAA' }));

    await client.fund('CESCROW', 'GSTARTUP', 10);
    expect(client.waits).toEqual([3000]);
  });

  it('gives up with a clear message after a few tries', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(reply(429)));

    await expect(client.fund('CESCROW', 'GSTARTUP', 10)).rejects.toThrow(
      new ServiceUnavailableException(
        'Trustless Work is busy right now. Try again in a minute',
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(client.waits).toEqual([1000, 2000, 4000]);
  });

  it('does not retry other errors', async () => {
    fetchMock.mockResolvedValue(reply(400, { message: 'Escrow not found' }));
    await expect(client.fund('CESCROW', 'GSTARTUP', 10)).rejects.toThrow(
      'This escrow was not found on Stellar',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not pass the text of Trustless Work to the user', async () => {
    fetchMock.mockResolvedValue(
      reply(500, { message: 'HostError: Error(Contract, #12) at GABC...XYZ /srv/tw/escrow.ts' }),
    );
    const error = await client.fund('CESCROW', 'GSTARTUP', 10).catch((e: Error) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as Error).message).toBe(
      'The escrow service could not complete this step. Try again',
    );
  });

  it('holds requests back once Pocket spent its own budget', async () => {
    // A fresh response each time: a body can only be read once.
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ unsignedTransaction: 'xdr' }), { status: 200 }),
      ),
    );
    for (let i = 0; i < TRUSTLESS_WORK_BUDGET_PER_MINUTE; i++) {
      await client.fund('C1', 'G1', 1);
    }
    await expect(client.fund('C1', 'G1', 1)).rejects.toThrow('busy right now');
    // Held back before reaching Trustless Work.
    expect(fetchMock).toHaveBeenCalledTimes(TRUSTLESS_WORK_BUDGET_PER_MINUTE);
  });

  describe('retryDelayMs', () => {
    it('backs off 1, 2 and 4 seconds without Retry-After', () => {
      expect([0, 1, 2].map((attempt) => retryDelayMs(null, attempt))).toEqual([
        1000, 2000, 4000,
      ]);
    });

    it('ignores a Retry-After it cannot read and caps long waits', () => {
      expect(retryDelayMs('soon', 0)).toBe(1000);
      expect(retryDelayMs('600', 0)).toBe(20_000);
    });
  });
});
