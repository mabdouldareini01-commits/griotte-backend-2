// ══════════════════════════════════════════════════
// GRIOTTE — main.ts
// ══════════════════════════════════════════════════

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // ─── Global prefix
  app.setGlobalPrefix('api/v1');

  // ─── Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ─── Body size limit (images base64)
  const express = require('express');
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // ─── CORS
  app.enableCors({
   origin: ['https://griotte-frontend-git-main-lawenignina.vercel.app', 'http://localhost:3000'],
    credentials: true,
  });

  // ─── Swagger
  const config = new DocumentBuilder()
    .setTitle('GRIOTTE API')
    .setDescription('API de la marketplace africaine de littérature numérique')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentification')
    .addTag('users', 'Gestion des utilisateurs')
    .addTag('books', 'Gestion des romans')
    .addTag('chapters', 'Gestion des chapitres')
    .addTag('reading', 'Sessions de lecture')
    .addTag('wallet', 'Portefeuille & transactions')
    .addTag('withdrawals', 'Retraits auteur')
    .addTag('notifications', 'Notifications')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`🚀 GRIOTTE API démarré sur http://localhost:${port}/api/v1`);
  logger.log(`📚 Swagger : http://localhost:${port}/api/docs`);
}

bootstrap();
