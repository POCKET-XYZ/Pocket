import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { escapeHtml, render, type NotificationEvent } from './templates';

const paid: NotificationEvent = {
  type: 'milestone_paid',
  contractId: 'contract-1',
  milestoneTitle: 'Lead list',
  amount: '100.5',
};

function serviceWith(
  values: Record<string, string>,
  prisma: { verificationRequest: { findMany: jest.Mock } },
) {
  const config = { get: (key: string) => values[key] } as unknown as ConfigService;
  return new NotificationsService(prisma as unknown as PrismaService, config);
}

const ON = {
  'email.resendApiKey': 're_test_key',
  'email.from': 'Pocket <hola@example.com>',
  'email.webPublicUrl': 'https://pocket.example',
};

describe('NotificationsService', () => {
  let fetchMock: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let prisma: { verificationRequest: { findMany: jest.Mock } };

  beforeEach(() => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{"id":"email-1"}', { status: 200 }));
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    prisma = {
      verificationRequest: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { userId: 'specialist-1', contactEmail: 'ana@example.com' },
          ]),
      },
    };
  });

  afterEach(() => jest.restoreAllMocks());

  it("sends Resend the email, to the user's verified contact email", async () => {
    await serviceWith(ON, prisma).sendToUsers(['specialist-1'], paid);

    expect(prisma.verificationRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: { in: ['specialist-1'] }, status: 'approved' },
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      authorization: 'Bearer re_test_key',
      'content-type': 'application/json',
    });
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      from: 'Pocket <hola@example.com>',
      to: ['ana@example.com'],
      subject: 'You were paid 100.5 USDC',
      html: expect.stringContaining('https://pocket.example/contracts/contract-1'),
      text: expect.stringContaining('https://pocket.example/contracts/contract-1'),
    });
  });

  it('sends nothing to a user without a verified contact email', async () => {
    prisma.verificationRequest.findMany.mockResolvedValue([]);
    await serviceWith(ON, prisma).sendToUsers(['startup-1'], paid);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing at all without an API key', async () => {
    const service = serviceWith({ ...ON, 'email.resendApiKey': '' }, prisma);
    await service.sendToUsers(['specialist-1'], paid);
    await service.send('ana@example.com', { type: 'verification_approved' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.verificationRequest.findMany).not.toHaveBeenCalled();
  });

  it('never throws when Resend is down, and logs without the address', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(
      serviceWith(ON, prisma).sendToUsers(['specialist-1'], paid),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('milestone_paid'));
    expect(JSON.stringify(warn.mock.calls)).not.toContain('ana@example.com');
  });

  it('never throws when Resend refuses the email', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"message":"bad ana@example.com"}', { status: 422 }),
    );
    await expect(
      serviceWith(ON, prisma).send('ana@example.com', { type: 'verification_approved' }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('HTTP 422'));
    expect(JSON.stringify(warn.mock.calls)).not.toContain('ana@example.com');
  });

  it('never throws when the database lookup fails', async () => {
    prisma.verificationRequest.findMany.mockRejectedValue(new Error('connection lost'));
    await expect(
      serviceWith(ON, prisma).sendToUsers(['specialist-1'], paid),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns at once from notify, without waiting for or failing on the send', () => {
    fetchMock.mockRejectedValue(new Error('down'));
    const service = serviceWith(ON, prisma);
    expect(service.notifyUsers(['specialist-1'], paid)).toBeUndefined();
    expect(
      service.notifyEmail('ana@example.com', { type: 'verification_approved' }),
    ).toBeUndefined();
  });
});

describe('templates', () => {
  it('escapes what users typed in the HTML and keeps it readable in the text', () => {
    const email = render(
      {
        type: 'verification_rejected',
        reason: '<script>alert("x")</script> & more',
      },
      'https://pocket.example/',
    );
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; more',
    );
    expect(email.text).toContain('<script>alert("x")</script> & more');
    expect(email.html).toContain('href="https://pocket.example/verification"');
  });

  it('keeps a subject on one line whatever the title holds', () => {
    const email = render(
      { type: 'offer_received', contractId: 'c-1', jobTitle: 'Growth\nplan' },
      'https://pocket.example',
    );
    expect(email.subject).toBe('New offer: Growth plan');
  });

  it('escapes every HTML special character', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});
