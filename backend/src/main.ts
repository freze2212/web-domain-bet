import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { appConfig } from './config/env.config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('NestBootstrap');

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const port = appConfig.port || 3000;
  await app.listen(port);
  logger.log(`🚀 NestJS Backend server is running on http://localhost:${port}`);
}

bootstrap();
