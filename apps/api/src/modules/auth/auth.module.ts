import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PollarModule } from '../pollar/pollar.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { WalletChallengeService } from './wallet-challenge.service';

@Module({
  imports: [
    PollarModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        signOptions: { expiresIn: config.get('jwt.expiresIn') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, WalletChallengeService],
})
export class AuthModule {}
