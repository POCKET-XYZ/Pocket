import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { securityEventsMiddleware } from './common/security/security-events.middleware';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Behind the host's proxy every request would look like it came from the
  // proxy. Trust exactly as many hops as sit in front of the API, and no more:
  // trusting more lets a caller pick their own IP with X-Forwarded-For.
  app.set('trust proxy', config.get<number>('trustProxyHops') ?? 0);

  app.use(helmet());
  app.use(securityEventsMiddleware);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.get<string[]>('corsOrigins'), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // The API map, with every route, DTO and role, is for us, not for whoever
  // probes production.
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Pocket API')
      .setDescription(
        'Marketplace for startups and growth specialists with escrow payments on Stellar',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  await app.listen(config.get<number>('port') ?? 3000);
}

void bootstrap();
