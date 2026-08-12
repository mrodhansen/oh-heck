import { config as loadEnv } from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/http-exception.filter';

loadEnv();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // GitHub Pages (and any origin) can call the API.
  // Note: CORS_ORIGIN="*" as a string-array breaks the cors package — use true to reflect Origin.
  const raw = process.env.CORS_ORIGIN?.trim();
  // Live play sends x-live-token on GET /live/:id; browsers preflight that header.
  // If it is missing from allowedHeaders, fetch fails as a generic "Network error".
  const allowedHeaders = [
    'Content-Type',
    'Authorization',
    'ngrok-skip-browser-warning',
    'x-live-token',
  ];
  if (!raw || raw === '*') {
    app.enableCors({
      origin: true,
      credentials: true,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders,
    });
  } else {
    app.enableCors({
      origin: raw.split(',').map((s) => s.trim()),
      credentials: true,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders,
    });
  }

  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}

bootstrap();
