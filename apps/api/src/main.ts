import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());
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
