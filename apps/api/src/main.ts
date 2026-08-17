import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { Env } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Env, true>);

  app.use(helmet());
  app.enableCors({ origin: config.get('CORS_ORIGIN', { infer: true }), credentials: true });
  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('PCAARB API')
    .setDescription('API do SaaS de gestão empresarial PCAARB')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  console.warn(`PCAARB API rodando em http://localhost:${port}/api`);
}

bootstrap();
