import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { RateLimiter } from './common/rate-limit/rate-limiter';
import { RolesGuard } from './common/guards/roles.guard';
import { VerifiedGuard } from './common/guards/verified.guard';
import { HealthController } from './health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { ManagerModule } from './modules/manager/manager.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { StellarModule } from './modules/stellar/stellar.module';
import { VerificationModule } from './modules/verification/verification.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import configuration, { validateEnv } from './config/configuration';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    VerificationModule,
    ManagerModule,
    ProfilesModule,
    JobsModule,
    StellarModule,
    ContractsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Reports unexpected errors (not 4xx answers) to Sentry, then answers as usual.
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
    { provide: RateLimiter, useValue: new RateLimiter() },
    // Order matters: authentication first, so the limiter counts a signed-in
    // user by account rather than by the IP they share with others.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: VerifiedGuard },
  ],
})
export class AppModule {}
