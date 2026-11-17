import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER, APP_PIPE } from '@nestjs/core';

// Configuration
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import corsConfig from './config/cors.config';

// Modules
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { KycModule } from './kyc/kyc.module';
import { PropertiesModule } from './properties/properties.module';
import { BookingsModule } from './bookings/bookings.module';
import { EarningsModule } from './earnings/earnings.module';
import { WithdrawalsModule } from './withdrawals/withdrawals.module';
import { AdminModule } from './admin/admin.module';
import { VoiceModule } from './voice/voice.module';
import { MessagesModule } from './messages/messages.module';
import { ReviewsModule } from './reviews/reviews.module';
import { WishlistModule } from './wishlist/wishlist.module';

// Guards & Filters
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HttpThrottlerGuard } from './common/guards/http-throttler.guard';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { createValidationPipe } from './common/pipes/validation.pipe';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, corsConfig],
      envFilePath: ['.env', '.env.local', `.env.${process.env.NODE_ENV || 'development'}`],
    }),

    // Scheduled tasks (booking auto-completion, etc)
    ScheduleModule.forRoot(),

    // Rate limiting. Default: RATE_LIMIT_MAX requests per RATE_LIMIT_TTL
    // seconds per client IP (100 per 60s unless configured). Auth and upload
    // routes set tighter limits with @Throttle.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: Number(config.get('RATE_LIMIT_TTL') ?? 60) * 1000,
          limit: Number(config.get('RATE_LIMIT_MAX') ?? 100),
        },
      ],
    }),

    // Database
    PrismaModule,

    // Common Services
    CommonModule,

    // Feature Modules
    AuthModule,
    UsersModule,
    KycModule,
    PropertiesModule,
    BookingsModule,
    EarningsModule,
    WithdrawalsModule,
    AdminModule,
    VoiceModule,
    MessagesModule,
    ReviewsModule,
    WishlistModule,
  ],
  providers: [
    // Global rate limit — first, so it also covers public routes and
    // requests that fail authentication (e.g. password guessing).
    {
      provide: APP_GUARD,
      useClass: HttpThrottlerGuard,
    },
    // Global JWT Guard (with @Public() decorator support)
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global Roles Guard
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    // Global Exception Filter
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    // Global Validation Pipe
    {
      provide: APP_PIPE,
      useFactory: createValidationPipe,
    },
  ],
})
export class AppModule {}
