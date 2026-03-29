import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { assertRuntimeConfig } from './config/assert-runtime-config';

function resolveCorsOrigins() {
  const raw = process.env.CORS_ALLOWED_ORIGINS?.trim() || '';
  const isProduction = (process.env.NODE_ENV || '').trim() === 'production';

  if (!raw) {
    if (isProduction) {
      return null;
    }

    return ['http://localhost:5173', 'http://127.0.0.1:5173'];
  }

  if (raw === '*') {
    return true;
  }

  const origins = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : null;
}

async function bootstrap() {
  assertRuntimeConfig();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  const corsOrigins = resolveCorsOrigins();
  if (corsOrigins) {
    app.enableCors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    });
  }
  app.useGlobalPipes(new ValidationPipe());
  const port = Number.parseInt(process.env.PORT ?? '3000', 10) || 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
