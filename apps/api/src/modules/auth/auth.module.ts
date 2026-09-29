import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PollarModule } from '../pollar/pollar.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { WalletChallengeService } from './wallet-challenge.service';

const JWT_ISSUER = 'pocket-api';
const JWT_AUDIENCE = 'pocket-web';

@Module({
  imports: [
    PollarModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        // Pinned, so a token is only ever read the way Pocket wrote it.
        signOptions: {
          expiresIn: config.get('jwt.expiresIn'),
          algorithm: 'HS256',
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
        verifyOptions: {
          algorithms: ['HS256'],
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, WalletChallengeService],
})
export class AuthModule {}
