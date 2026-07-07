import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import * as compression from 'compression';
import * as helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Security middleware
  app.use(helmet.default());
  app.use(compression.default());
  app.use(cookieParser.default());

  // Raise the default body size limit (Express defaults to ~100kb, which is
  // too small for the base64-encoded image payloads sent to /upload/images
  // and /kyc — those routes accept JSON bodies containing one or more
  // base64 photos rather than multipart uploads). 15mb gives headroom for a
  // few photos per request; tighten this if you move uploads to direct
  // client-to-Cloudinary signed uploads instead.
  app.use(json({ limit: '15mb' }));
  app.use(urlencoded({ extended: true, limit: '15mb' }));

  // CORS configuration
  const corsOptions = configService.get('cors');
  app.enableCors(corsOptions);

  // Global prefix
  const apiPrefix = configService.get<string>('app.apiPrefix');
  const apiVersion = configService.get<string>('app.apiVersion');
  const globalPrefix = `${apiPrefix}/${apiVersion}`;
  app.setGlobalPrefix(globalPrefix);
  
  logger.log(`API prefix: ${globalPrefix}`);

  // Port configuration
  const port = configService.get<number>('app.port') || 3000;

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('StayConnect NG API')
    .setDescription('Mobile Accommodation Marketplace Backend API')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Authentication', 'User authentication endpoints')
    .addTag('Users', 'User management endpoints')
    .addTag('KYC Verification', 'KYC verification endpoints')
    .addTag('Properties', 'Property management endpoints')
    .addTag('Bookings', 'Booking management endpoints')
    .addTag('Earnings', 'Host earnings endpoints')
    .addTag('Withdrawals', 'Withdrawal request endpoints')
    .addTag('Admin', 'Admin dashboard endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${apiPrefix}/${apiVersion}/docs`, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
    },
  });

  await app.listen(port, '0.0.0.0');

  logger.log(`Server running on port ${port}`);
  logger.log(`API docs available at /${apiPrefix}/${apiVersion}/docs`);
}

bootstrap();
