import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiErrorCode } from '@pocket/shared';
import type { User, WalletCustody } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../../common/types/auth';
import { PollarClient, type PollarSession } from '../pollar/pollar.client';
import { LoginDto } from './dto/login.dto';
import { PollarLoginDto } from './dto/pollar-login.dto';
import { WalletChallengeService } from './wallet-challenge.service';

export interface LoginResult {
  accessToken: string;
  user: User;
  isNewUser: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly challenges: WalletChallengeService,
    private readonly pollar: PollarClient,
  ) {}

  /**
   * Sign in with a signed wallet challenge. The first login creates the
   * account, so it must say whether the user is a startup or a specialist.
   */
  async login(dto: LoginDto): Promise<LoginResult> {
    const nonce = await this.challenges.verify(dto.stellarAddress, dto.signedXdr);
    if (!nonce) {
      throw new UnauthorizedException('Invalid or expired wallet signature');
    }

    const existing = await this.prisma.user.findUnique({
      where: { stellarAddress: dto.stellarAddress },
    });
    if (!existing && !dto.role) {
      // The challenge is kept, so the client can resend it with a role
      // without asking the wallet to sign again.
      throw new BadRequestException({
        code: ApiErrorCode.RoleRequired,
        message: 'Choose startup or specialist to create your account',
      });
    }

    // Use the challenge before issuing anything: a replay racing this login
    // loses here, and never gets a token or creates an account.
    if (!(await this.challenges.consume(dto.stellarAddress, nonce))) {
      throw new UnauthorizedException('This signature was already used');
    }

    const user =
      existing ??
      (await this.prisma.user.create({
        data: { stellarAddress: dto.stellarAddress, role: dto.role! },
      }));
    return { accessToken: await this.sign(user), user, isNewUser: !existing };
  }

  /**
   * Sign in with a Pollar session. Pollar already proved who the user is, with
   * a social or email login or with their own wallet, so there is no challenge
   * to sign here: the access token is checked against Pollar's server and the
   * wallet it reports becomes the Pocket account.
   */
  async loginWithPollar(dto: PollarLoginDto): Promise<LoginResult> {
    if (!this.pollar.enabled) {
      throw new ServiceUnavailableException('Pollar sign-in is not configured');
    }
    const session = await this.pollar.verifyToken(dto.accessToken);
    if (session.custody === 'smart' || !session.stellarAddress.startsWith('G')) {
      // Escrow roles are classic Stellar accounts. A passkey smart account is a
      // contract address, and Trustless Work cannot give it a role.
      throw new BadRequestException(
        'Pocket needs a classic Stellar account. Sign in with email, Google or a wallet',
      );
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { stellarAddress: session.stellarAddress },
          { pollarUserId: session.userId },
        ],
      },
    });

    if (existing && existing.stellarAddress !== session.stellarAddress) {
      // The same Pollar account now reports another address. Changing it would
      // break every escrow the old address holds a role in.
      throw new ConflictException(
        'This Pollar account is already linked to another wallet on Pocket',
      );
    }

    if (!existing) {
      if (!dto.role) {
        throw new BadRequestException({
          code: ApiErrorCode.RoleRequired,
          message: 'Choose startup or specialist to create your account',
        });
      }
      const created = await this.prisma.user.create({
        data: {
          stellarAddress: session.stellarAddress,
          role: dto.role,
          ...pollarFields(session),
        },
      });
      return { accessToken: await this.sign(created), user: created, isNewUser: true };
    }

    const user = await this.prisma.user.update({
      where: { id: existing.id },
      data: pollarFields(session, existing),
    });
    return { accessToken: await this.sign(user), user, isNewUser: false };
  }

  private sign(user: User): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      stellarAddress: user.stellarAddress,
    };
    return this.jwt.signAsync(payload);
  }
}

/**
 * What Pocket keeps from a Pollar session. A wallet the user connected stays
 * `external`, because it can sign escrow operations; one that only signs
 * through Pollar cannot, and the rest of the app reads this to know which is
 * which.
 */
function pollarFields(
  session: PollarSession,
  existing?: Pick<User, 'walletFundedAt'>,
): {
  pollarUserId: string;
  walletCustody: WalletCustody;
  walletProvider: string | null;
  email?: string;
  walletFundedAt?: Date;
} {
  return {
    pollarUserId: session.userId,
    walletCustody: session.custody === 'external' ? 'external' : 'pollar',
    walletProvider: session.provider ?? null,
    ...(session.email ? { email: session.email } : {}),
    // Keep the first date: this is when the wallet came alive on Stellar.
    ...(session.funded && !existing?.walletFundedAt ? { walletFundedAt: new Date() } : {}),
  };
}
