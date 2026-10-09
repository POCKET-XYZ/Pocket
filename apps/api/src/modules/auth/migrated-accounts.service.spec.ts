import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PollarWalletsService } from '../pollar/pollar-wallets.service';
import { MigratedAccountsService } from './migrated-accounts.service';

const ADDRESS = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
const NEW_USER_ID = '11111111-1111-4111-8111-111111111111';

function waitingAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mig-1',
    email: 'leo@example.com',
    role: 'specialist',
    verification: { fullName: 'Leo', contactEmail: 'leo@example.com', country: 'BO' },
    profile: {
      displayName: 'Leo',
      headline: 'Growth specialist for startups',
      bio: 'x'.repeat(60),
      categories: ['growth'],
      cvUrl:
        'https://pocket-api-production-1d28.up.railway.app/api/profiles/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cv',
      linkedinUrl: 'https://linkedin.com/in/leo',
    },
    cv: Buffer.from('%PDF-1.4 cv'),
    logo: null,
    logoContentType: null,
    claimedAt: null,
    claimedById: null,
    ...overrides,
  };
}

describe('MigratedAccountsService', () => {
  let tx: Record<string, Record<string, jest.Mock>>;
  let prisma: { migratedAccount: { findUnique: jest.Mock }; $transaction: jest.Mock };
  let wallets: { activate: jest.Mock };
  let service: MigratedAccountsService;
  const session = {
    email: ' Leo@Example.com ',
    stellarAddress: ADDRESS,
    userFields: {
      pollarUserId: 'usr_mainnet_1',
      walletCustody: 'pollar' as const,
      walletProvider: 'google',
    },
  };

  beforeEach(() => {
    tx = {
      migratedAccount: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      user: { create: jest.fn().mockResolvedValue({ id: NEW_USER_ID, role: 'specialist' }) },
      verificationRequest: { create: jest.fn() },
      specialistProfile: { create: jest.fn() },
      specialistCv: { create: jest.fn() },
      startupProfile: { create: jest.fn() },
      startupLogo: { create: jest.fn() },
    };
    prisma = {
      migratedAccount: { findUnique: jest.fn().mockResolvedValue(waitingAccount()) },
      $transaction: jest.fn((run: (t: unknown) => unknown) => run(tx)),
    };
    wallets = { activate: jest.fn().mockResolvedValue(true) };
    service = new MigratedAccountsService(
      prisma as unknown as PrismaService,
      { get: () => 'https://api.mainnet.example/api' } as unknown as ConfigService,
      wallets as unknown as PollarWalletsService,
    );
  });

  it('matches the email in lowercase and creates an approved account on the new wallet', async () => {
    const user = await service.claim(session);
    expect(prisma.migratedAccount.findUnique).toHaveBeenCalledWith({
      where: { email: 'leo@example.com' },
    });
    expect(user?.id).toBe(NEW_USER_ID);
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stellarAddress: ADDRESS,
        role: 'specialist',
        verificationStatus: 'approved',
        pollarUserId: 'usr_mainnet_1',
      }),
    });
    expect(tx.verificationRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: NEW_USER_ID,
        status: 'approved',
        fullName: 'Leo',
        country: 'BO',
      }),
    });
  });

  it('carries the CV and points the profile at the mainnet copy', async () => {
    await service.claim(session);
    expect(tx.specialistCv.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: NEW_USER_ID, size: 11 }),
    });
    expect(tx.specialistProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: NEW_USER_ID,
        cvUrl: `https://api.mainnet.example/api/profiles/${NEW_USER_ID}/cv`,
        linkedinUrl: 'https://linkedin.com/in/leo',
      }),
    });
  });

  it('drops a link to a testnet file that did not come along', async () => {
    prisma.migratedAccount.findUnique.mockResolvedValue(waitingAccount({ cv: null }));
    await service.claim(session);
    expect(tx.specialistCv.create).not.toHaveBeenCalled();
    expect(tx.specialistProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ cvUrl: null }),
    });
  });

  it('carries a startup logo', async () => {
    prisma.migratedAccount.findUnique.mockResolvedValue(
      waitingAccount({
        role: 'startup',
        profile: {
          companyName: 'Writz',
          oneLiner: 'Writing tools for teams',
          sector: 'Software',
          stage: 'seed',
          lookingFor: 'x'.repeat(30),
        },
        cv: null,
        logo: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        logoContentType: 'image/png',
      }),
    );
    tx.user.create.mockResolvedValue({ id: NEW_USER_ID, role: 'startup' });
    await service.claim(session);
    expect(tx.startupLogo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: NEW_USER_ID, contentType: 'image/png', size: 4 }),
    });
    const created = tx.startupProfile.create.mock.calls[0][0].data;
    expect(created.companyName).toBe('Writz');
    expect(created.logoUrl).toMatch(
      new RegExp(`^https://api\\.mainnet\\.example/api/profiles/${NEW_USER_ID}/logo\\?v=\\d+$`),
    );
  });

  it('funds the wallet like a manager approval does', async () => {
    await service.claim(session);
    expect(wallets.activate).toHaveBeenCalledWith(NEW_USER_ID);
  });

  it('does nothing without an email, or for an email nobody carried over', async () => {
    expect(await service.claim({ ...session, email: undefined })).toBeNull();
    prisma.migratedAccount.findUnique.mockResolvedValue(null);
    expect(await service.claim(session)).toBeNull();
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('hands an account over once: a claimed one, or one claimed meanwhile, is not given again', async () => {
    prisma.migratedAccount.findUnique.mockResolvedValue(
      waitingAccount({ claimedAt: new Date() }),
    );
    expect(await service.claim(session)).toBeNull();
    prisma.migratedAccount.findUnique.mockResolvedValue(waitingAccount());
    tx.migratedAccount.updateMany.mockResolvedValue({ count: 0 });
    expect(await service.claim(session)).toBeNull();
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(wallets.activate).not.toHaveBeenCalled();
  });
});
