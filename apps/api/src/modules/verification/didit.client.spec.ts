import type { ConfigService } from '@nestjs/config';
import {
  DiditClient,
  isKycEnabled,
  normalizeKycStatus,
  readDecision,
} from './didit.client';

function config(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const ON = {
  'kyc.diditApiUrl': 'https://verification.didit.test',
  'kyc.diditApiKey': 'key',
  'kyc.diditWorkflowId': 'wf-1',
  'kyc.diditWebhookSecret': 'whsec',
  'email.webPublicUrl': 'https://app.pocket.test',
};

describe('normalizeKycStatus', () => {
  it.each([
    ['Approved', 'Approved'],
    ['APPROVED', 'Approved'],
    ['IN_REVIEW', 'In Review'],
    ['In Review', 'In Review'],
    ['not started', 'Not Started'],
    ['KYC_EXPIRED', 'Kyc Expired'],
  ])('reads %s as %s', (input, expected) => {
    expect(normalizeKycStatus(input)).toBe(expected);
  });

  it('reads anything else as no status', () => {
    expect(normalizeKycStatus(undefined)).toBe('');
    expect(normalizeKycStatus(42)).toBe('');
  });
});

describe('readDecision', () => {
  it('collects other accounts that showed the same document or face', () => {
    const decision = readDecision({
      session_id: 'sess-1',
      status: 'APPROVED',
      vendor_data: 'user-1',
      id_verifications: [
        {
          status: 'Approved',
          document_number: 'kept at Didit',
          matches: [
            { session_id: 'old', vendor_data: 'user-1' },
            { session_id: 'other', vendor_data: 'user-9' },
          ],
          warnings: [
            { risk: 'POSSIBLE_DUPLICATED_USER', short_description: 'Seen before' },
          ],
        },
      ],
      liveness_checks: [{ matches: [{ vendor_data: 'user-8', is_blocklisted: true }] }],
    });

    expect(decision).toEqual({
      sessionId: 'sess-1',
      status: 'Approved',
      vendorData: 'user-1',
      // The user's own earlier sessions are not another account.
      sharedWith: ['user-9', 'user-8'],
      blocklisted: true,
      reasons: ['Seen before'],
    });
    // Only what Pocket acts on leaves this function: no document data.
    expect(JSON.stringify(decision)).not.toContain('kept at Didit');
  });

  it('reads the checks nested under decision, as webhooks send them', () => {
    const decision = readDecision({
      session_id: 'sess-1',
      status: 'Declined',
      vendor_data: 'user-1',
      decision: { id_verifications: [{ warnings: [{ risk: 'DOCUMENT_EXPIRED' }] }] },
    });
    expect(decision.status).toBe('Declined');
    expect(decision.reasons).toEqual(['DOCUMENT_EXPIRED']);
    expect(decision.sharedWith).toEqual([]);
  });

  it('copes with a decision that has no checks yet', () => {
    expect(readDecision({ session_id: 'sess-1', status: 'Not Started' })).toEqual({
      sessionId: 'sess-1',
      status: 'Not Started',
      vendorData: null,
      sharedWith: [],
      blocklisted: false,
      reasons: [],
    });
  });
});

describe('isKycEnabled', () => {
  it('needs all three values', () => {
    expect(isKycEnabled(config(ON))).toBe(true);
    expect(isKycEnabled(config({ ...ON, 'kyc.diditWebhookSecret': '' }))).toBe(false);
    expect(isKycEnabled(config({}))).toBe(false);
  });
});

describe('DiditClient', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => fetchMock.mockRestore());

  it('opens a session for the user, coming back to the web in Spanish', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          session_id: 'sess-1',
          url: 'https://verify.didit.me/session/x',
        }),
        { status: 201 },
      ),
    );
    const client = new DiditClient(config(ON));

    await expect(client.createSession('user-1', 'req-1')).resolves.toEqual({
      sessionId: 'sess-1',
      url: 'https://verify.didit.me/session/x',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://verification.didit.test/v3/session/');
    expect(init.headers).toMatchObject({ 'x-api-key': 'key' });
    expect(JSON.parse(init.body as string)).toEqual({
      workflow_id: 'wf-1',
      vendor_data: 'user-1',
      callback: 'https://app.pocket.test/verification',
      callback_method: 'both',
      language: 'es',
      metadata: { requestId: 'req-1' },
    });
  });

  it('refuses a session link that is not https', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ session_id: 'sess-1', url: 'http://evil.test' }), {
        status: 201,
      }),
    );
    await expect(
      new DiditClient(config(ON)).createSession('user-1', 'req-1'),
    ).rejects.toThrow('servicio de verificación');
  });

  it('turns Didit being down into a clear message', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    await expect(new DiditClient(config(ON)).decision('sess-1')).rejects.toThrow(
      'servicio de verificación',
    );
    fetchMock.mockRejectedValue(new Error('network'));
    await expect(new DiditClient(config(ON)).decision('sess-1')).rejects.toThrow(
      'servicio de verificación',
    );
  });

  it('reads a decision from the session it names', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          session_id: 'sess-1',
          status: 'In Review',
          vendor_data: 'user-1',
        }),
        { status: 200 },
      ),
    );
    const decision = await new DiditClient(config(ON)).decision('sess-1');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://verification.didit.test/v3/session/sess-1/decision/',
    );
    expect(decision.status).toBe('In Review');
  });
});
