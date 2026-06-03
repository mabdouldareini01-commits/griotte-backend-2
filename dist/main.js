"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const logger = new common_1.Logger('Bootstrap');
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
    }));
    const express = require('express');
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ limit: '10mb', extended: true }));
    app.enableCors({
        origin: ['https://griotte-frontend-git-main-lawenignina.vercel.app', 'http://localhost:3000'],
        credentials: true,
    });
    const config = new swagger_1.DocumentBuilder()
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
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    swagger_1.SwaggerModule.setup('api/docs', app, document);
    const port = process.env.PORT || 4000;
    await app.listen(port);
    logger.log(`🚀 GRIOTTE API démarré sur http://localhost:${port}/api/v1`);
    logger.log(`📚 Swagger : http://localhost:${port}/api/docs`);
}
bootstrap();
//# sourceMappingURL=main.js.map