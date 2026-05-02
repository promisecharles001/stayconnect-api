import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as compression from 'compression';
import * as helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Security middleware
  app.use(helmet.default());
  app.use(compression.default());
  app.use(cookieParser.default());

  // CORS configuration
  const corsOptions = configService.get('cors');
  app.enableCors(corsOptions);

  // Global prefix
  const apiPrefix = configService.get<string>('app.apiPrefix');
  const apiVersion = configService.get<string>('app.apiVersion');
  const globalPrefix = `${apiPrefix}/${apiVersion}`;
  app.setGlobalPrefix(globalPrefix);
  
  console.log('PREFIX:', globalPrefix);
  console.log('API_PREFIX from env:', process.env.API_PREFIX);
  console.log('API_VERSION from env:', process.env.API_VERSION);

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

  console.log(`
  ╔════════════════════════════════════════════════════════════╗
  ║                                                            ║
  ║           🏠 StayConnect NG Backend Server                 ║
  ║                                                            ║
  ╠════════════════════════════════════════════════════════════╣
  ║  📡 Server running on: http://localhost:${port}              ║
  ║  📚 API Documentation: http://localhost:${port}/${apiPrefix}/${apiVersion}/docs ║
  ║  🔑 API Prefix: /${apiPrefix}/${apiVersion}                        ║
  ║                                                            ║
  ╚════════════════════════════════════════════════════════════╝
  `);
}

bootstrap();
