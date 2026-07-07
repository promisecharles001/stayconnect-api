import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { BookingCompletionTask } from './booking-completion.task';
import { EarningsModule } from '../earnings/earnings.module';

@Module({
  imports: [EarningsModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingCompletionTask],
  exports: [BookingsService],
})
export class BookingsModule {}
