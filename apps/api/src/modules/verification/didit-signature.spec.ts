import { createHmac } from 'node:crypto';
import { canonicalJson, isAuthenticDiditWebhook } from './didit-signature';

const SECRET = 'whsec-test';
const NOW = 1_800_000_000;

const payload = {
  webhook_type: 'status.updated',
  session_id: 'sess-1',
  status: 'Approved',
  vendor_data: 'user-1',
  timestamp: NOW,
  decision: {
    id_verifications: [{ status: 'Approved', score: 98.5, name: 'Ñandú Pérez' }],
  },
};

const sign = (data: string | Buffer, secret = SECRET) =>
  createHmac('sha256', secret).update(data).digest('hex');

describe('canonicalJson', () => {
  it('sorts keys at every level and keeps arrays in order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: 'é' } })).toBe(
      '{"a":{"c":"é","d":[3,{"y":2,"z":1}]},"b":1}',
    );
  });

  it('writes whole floats as integers, as Didit does', () => {
    expect(canonicalJson(JSON.parse('{"score": 100.0, "other": 0.5}'))).toBe(
      '{"other":0.5,"score":100}',
    );
  });
});

describe('isAuthenticDiditWebhook', () => {
  const v2 = sign(canonicalJson(payload));
  const headers = { 'x-timestamp': String(NOW), 'x-signature-v2': v2 };

  it('accepts a payload signed over its canonical form', () => {
    expect(
      isAuthenticDiditWebhook({ secret: SECRET, headers, payload, nowSeconds: NOW + 10 }),
    ).toBe(true);
  });

  it('refuses a payload changed after signing', () => {
    expect(
      isAuthenticDiditWebhook({
        secret: SECRET,
        headers,
        payload: { ...payload, vendor_data: 'user-2' },
        nowSeconds: NOW,
      }),
    ).toBe(false);
  });

  it('refuses a signature made with another secret', () => {
    expect(
      isAuthenticDiditWebhook({
        secret: SECRET,
        headers: { ...headers, 'x-signature-v2': sign(canonicalJson(payload), 'other') },
        payload,
        nowSeconds: NOW,
      }),
    ).toBe(false);
  });

  it('refuses an old delivery, even with a fresh header timestamp', () => {
    // The header is not signed; the body's own timestamp is.
    expect(
      isAuthenticDiditWebhook({
        secret: SECRET,
        headers: { ...headers, 'x-timestamp': String(NOW + 3600) },
        payload,
        nowSeconds: NOW + 3600,
      }),
    ).toBe(false);
    expect(
      isAuthenticDiditWebhook({
        secret: SECRET,
        headers,
        payload,
        nowSeconds: NOW + 301,
      }),
    ).toBe(false);
  });

  it('refuses a delivery without a timestamp or a signature', () => {
    expect(
      isAuthenticDiditWebhook({
        secret: SECRET,
        headers: { 'x-signature-v2': v2 },
        payload,
        nowSeconds: NOW,
      }),
    ).toBe(false);
    expect(
      isAuthenticDiditWebhook({
        secret: SECRET,
        headers: { 'x-timestamp': String(NOW) },
        payload,
        nowSeconds: NOW,
      }),
    ).toBe(false);
    expect(
      isAuthenticDiditWebhook({
        secret: SECRET,
        headers: { ...headers, 'x-signature-v2': 'not hex' },
        payload,
        nowSeconds: NOW,
      }),
    ).toBe(false);
  });

  it('accepts the previous secret signature during a rotation', () => {
    expect(
      isAuthenticDiditWebhook({
        secret: SECRET,
        headers: {
          'x-timestamp': String(NOW),
          'x-signature-v2': sign(canonicalJson(payload), 'new-secret'),
          'x-signature-v2-previous': v2,
        },
        payload,
        nowSeconds: NOW,
      }),
    ).toBe(true);
  });

  it('falls back to the signature over the raw body', () => {
    const raw = Buffer.from(JSON.stringify(payload, null, 2));
    expect(
      isAuthenticDiditWebhook({
        secret: SECRET,
        headers: { 'x-timestamp': String(NOW), 'x-signature': sign(raw) },
        payload,
        rawBody: raw,
        nowSeconds: NOW,
      }),
    ).toBe(true);
  });

  it('refuses everything without a secret', () => {
    expect(
      isAuthenticDiditWebhook({ secret: '', headers, payload, nowSeconds: NOW }),
    ).toBe(false);
  });
});
