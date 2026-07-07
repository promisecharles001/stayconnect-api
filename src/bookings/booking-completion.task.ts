import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus } from '@prisma/client';
import { PushNotificationService } from '../common/services/push-notification.service';

/**
 * Bookings have no other path to BookingStatus.COMPLETED — without this,
 * a stay never "finishes" from the system's point of view, which quietly
 * breaks anything gated on a completed stay (reviews, completed-bookings
 * stats, etc) even though everything upstream of it works fine.
 *
 * Runs hourly: any ACCEPTED + payment-verified booking whose checkout
 * date has passed gets marked COMPLETED, and the guest gets a nudge to
 * leave a review.
 */
@Injectable()
export class BookingCompletionTask {
  private readonly logger = new Logger(BookingCompletionTask.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async completeFinishedBookings(): Promise<void> {
    const dueBookings = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.ACCEPTED,
        paymentVerified: true,
        endDate: { lt: new Date() },
      },
      include: { property: { select: { title: true } } },
    });

    if (dueBookings.length === 0) return;

    for (const booking of dueBookings) {
      await this.prisma.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.COMPLETED },
      });

      void this.pushNotificationService.sendToUser(booking.visitorId, {
        title: 'How was your stay?',
        body: `Your stay at "${booking.property.title}" is complete. Tap to leave a review!`,
        data: { type: 'review_prompt', bookingId: booking.id, propertyId: booking.propertyId },
      });
    }

    this.logger.log(`Auto-completed ${dueBookings.length} booking(s) past checkout`);
  }
}
