import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PollarClient, PollarSession } from '../pollar/pollar.client';
import { AuthService } from './auth.service';
import type { WalletChallengeService } from './wallet-challenge.service';

const ADDRESS = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
const OTHER_ADDRESS = 'GA47WBBZ3HFSAXVT4BIMU4TQGJCLQWCWP4LJDGAQW36HV2KL2HXLFQV3';

function makeSession(overrides: Partial<PollarSession> = {}): PollarSession {
  return {
    userId: 'usr_pollar_1',
    stellarAddress: ADDRESS,
    custody: 'internal',
    provider: 'google',
    email: 'founder@example.com',
    funded: true,
    network: 'testnet',
    ...overrides,
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '4f1c2a4e-1111-4b3b-9c1d-000000000001',
    stellarAddress: ADDRESS,
    role: 'startup',
    verificationStatus: 'not_submitted',
    walletCustody: 'external',
    walletProvider: null,
    pollarUserId: null,
    email: null,
    walletFundedAt: null,
    tokenVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  const jwt = new JwtService({ secret: 'test-secret' });
  let challenges: { verify: jest.Mock; consume: jest.Mock };
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  let pollar: { enabled: boolean; verifyToken: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    challenges = {
      verify: jest.fn().mockResolvedValue('nonce-1'),
      consume: jest.fn().mockResolvedValue(true),
    };
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    pollar = { enabled: true, verifyToken: jest.fn().mockResolvedValue(makeSession()) };
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt,
      challenges as unknown as WalletChallengeService,
      pollar as unknown as PollarClient,
    );
  });

  it('rejects an invalid signature', async () => {
    challenges.verify.mockResolvedValue(null);
    await expect(
      service.login({ stellarAddress: ADDRESS, signedXdr: 'x' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(challenges.consume).not.toHaveBeenCalled();
  });

  it('asks for a role on first login and keeps the challenge', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.login({ stellarAddress: ADDRESS, signedXdr: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(challenges.consume).not.toHaveBeenCalled();
  });

  it('creates the account when a role is given', async () => {
    const user = makeUser({ role: 'specialist' });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(user);

    const result = await service.login({
      stellarAddress: ADDRESS,
      signedXdr: 'x',
      role: 'specialist',
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { stellarAddress: ADDRESS, role: 'specialist' },
    });
    expect(result.isNewUser).toBe(true);
    expect(challenges.consume).toHaveBeenCalledWith(ADDRESS, 'nonce-1');
  });

  it('signs in an existing user and ignores the role field', async () => {
    const user = makeUser();
    prisma.user.findUnique.mockResolvedValue(user);

    const result = await service.login({
      stellarAddress: ADDRESS,
      signedXdr: 'x',
      role: 'specialist',
    });

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(result.isNewUser).toBe(false);
    const claims = await jwt.verifyAsync(result.accessToken);
    expect(claims).toMatchObject({
      sub: user.id,
      role: 'startup',
      stellarAddress: ADDRESS,
    });
  });

  it('gives nothing to a replay that lost the race for the challenge', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    challenges.consume.mockResolvedValue(false);
    await expect(
      service.login({ stellarAddress: ADDRESS, signedXdr: 'x', role: 'startup' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('puts the session version in the token', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ tokenVersion: 7 }));
    const result = await service.login({ stellarAddress: ADDRESS, signedXdr: 'x' });
    const claims = await jwt.verifyAsync<{ ver: number }>(result.accessToken);
    expect(claims.ver).toBe(7);
  });

  it('ends every session when the user signs out', async () => {
    await service.logout('user-1');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { tokenVersion: { increment: 1 } },
    });
  });

  describe('loginWithPollar', () => {
    it('creates the account from the wallet Pollar reports', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }: { data: Partial<User> }) =>
        Promise.resolve(makeUser(data)),
      );

      const result = await service.loginWithPollar({
        accessToken: 'pollar-token',
        role: 'specialist',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          stellarAddress: ADDRESS,
          role: 'specialist',
          walletCustody: 'pollar',
          walletProvider: 'google',
          pollarUserId: 'usr_pollar_1',
          email: 'founder@example.com',
        }),
      });
      expect(result.isNewUser).toBe(true);
      // No challenge is signed on this path.
      expect(challenges.verify).not.toHaveBeenCalled();
    });

    it('asks for a role the first time, like the wallet login does', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.loginWithPollar({ accessToken: 'pollar-token' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('records a connected wallet as the user own', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }: { data: Partial<User> }) =>
        Promise.resolve(makeUser(data)),
      );
      pollar.verifyToken.mockResolvedValue(
        makeSession({ custody: 'external', provider: 'freighter-native', email: undefined }),
      );

      const result = await service.loginWithPollar({
        accessToken: 'pollar-token',
        role: 'startup',
      });

      expect(result.user.walletCustody).toBe('external');
      expect(result.user.email).toBeNull();
    });

    it('refuses a passkey smart account, which cannot hold an escrow role', async () => {
      pollar.verifyToken.mockResolvedValue(
        makeSession({
          custody: 'smart',
          stellarAddress: 'CDPO6BSXSJFJOPIIBHQOPLPKTQ5TYTBAQ6ACISDL3YLDHMGATZEOBE4I',
        }),
      );
      await expect(
        service.loginWithPollar({ accessToken: 'pollar-token', role: 'startup' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to move a Pocket account to another wallet', async () => {
      prisma.user.findFirst.mockResolvedValue(
        makeUser({ stellarAddress: OTHER_ADDRESS, pollarUserId: 'usr_pollar_1' }),
      );
      await expect(
        service.loginWithPollar({ accessToken: 'pollar-token' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('keeps the date the wallet came alive on Stellar', async () => {
      const fundedAt = new Date('2026-09-20T10:00:00.000Z');
      const user = makeUser({
        walletCustody: 'pollar',
        walletFundedAt: fundedAt,
        pollarUserId: 'usr_pollar_1',
      });
      prisma.user.findFirst.mockResolvedValue(user);
      prisma.user.update.mockResolvedValue(user);

      await service.loginWithPollar({ accessToken: 'pollar-token' });

      const data = prisma.user.update.mock.calls[0][0].data as Partial<User>;
      expect(data.walletFundedAt).toBeUndefined();
    });

    it('does not let Pollar sign into an account that proved its wallet with a signature', async () => {
      // The account was created with a wallet challenge and never used Pollar.
      prisma.user.findFirst.mockResolvedValue(makeUser({ pollarUserId: null }));
      await expect(
        service.loginWithPollar({ accessToken: 'pollar-token' }),
      ).rejects.toThrow('Sign in with the wallet itself');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('does not let another Pollar user into an account', async () => {
      prisma.user.findFirst.mockResolvedValue(makeUser({ pollarUserId: 'usr_someone_else' }));
      await expect(
        service.loginWithPollar({ accessToken: 'pollar-token' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses an address that is not a valid Stellar account', async () => {
      pollar.verifyToken.mockResolvedValue(makeSession({ stellarAddress: 'GNOTAREALKEY' }));
      await expect(
        service.loginWithPollar({ accessToken: 'pollar-token', role: 'startup' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('is refused when Pollar is not configured', async () => {
      pollar.enabled = false;
      await expect(
        service.loginWithPollar({ accessToken: 'pollar-token' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(pollar.verifyToken).not.toHaveBeenCalled();
    });
  });
});
