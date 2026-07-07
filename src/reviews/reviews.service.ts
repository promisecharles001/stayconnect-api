import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus } from '@prisma/client';
import { PaginationUtil, PaginatedResult } from '../common/utils/pagination.util';
import { PushNotificationService } from '../common/services/push-notification.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto, RespondToReviewDto } from './dto/update-review.dto';
import { ReviewResponseDto, PropertyReviewsSummaryDto } from './dto/review-response.dto';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  async create(visitorId: string, dto: CreateReviewDto): Promise<ReviewResponseDto> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: { review: true, property: { select: { title: true } } },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.visitorId !== visitorId) {
      throw new ForbiddenException('You can only review your own bookings');
    }

    // Reviews are tied to a verified, completed stay — not just any
    // booking — so they actually mean something to other visitors browsing
    // the property. Bookings move to COMPLETED automatically once their
    // checkout date passes (see BookingCompletionTask).
    if (booking.status !== BookingStatus.COMPLETED) {
      throw new BadRequestException(
        'You can only review a booking after your stay is complete',
      );
    }

    if (booking.review) {
      throw new ConflictException('You have already reviewed this booking');
    }

    const review = await this.prisma.review.create({
      data: {
        bookingId: dto.bookingId,
        propertyId: booking.propertyId,
        visitorId,
        hostId: booking.hostId,
        rating: dto.rating,
        comment: dto.comment,
      },
      include: { visitor: { select: { firstName: true, lastName: true, avatarUrl: true } } },
    });

    await this.recomputePropertyRating(booking.propertyId);
    await this.recomputeHostRating(booking.hostId);

    void this.pushNotificationService.sendToUser(booking.hostId, {
      title: 'New Review',
      body: `You received a ${dto.rating}-star review for "${booking.property.title}"`,
      data: { type: 'review', propertyId: booking.propertyId },
    });

    this.logger.log(`Review created for booking ${dto.bookingId} by visitor ${visitorId}`);

    return this.toResponseDto(review);
  }

  async findByProperty(
    propertyId: string,
    options: { page?: number; limit?: number },
  ): Promise<PaginatedResult<ReviewResponseDto>> {
    const { page, limit } = PaginationUtil.normalizeOptions(options);

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { propertyId },
        include: { visitor: { select: { firstName: true, lastName: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        skip: PaginationUtil.calculateSkip({ page, limit }),
        take: limit,
      }),
      this.prisma.review.count({ where: { propertyId } }),
    ]);

    return {
      data: reviews.map((r) => this.toResponseDto(r)),
      meta: PaginationUtil.createMeta(total, { page, limit }),
    };
  }

  async getPropertySummary(propertyId: string): Promise<PropertyReviewsSummaryDto> {
    const reviews = await this.prisma.review.findMany({
      where: { propertyId },
      select: { rating: true },
    });

    const distribution: PropertyReviewsSummaryDto['ratingDistribution'] = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    let sum = 0;

    for (const { rating } of reviews) {
      const bucket = Math.min(5, Math.max(1, Math.round(rating))) as 1 | 2 | 3 | 4 | 5;
      distribution[bucket] += 1;
      sum += rating;
    }

    return {
      averageRating: reviews.length ? Number((sum / reviews.length).toFixed(2)) : 0,
      totalReviews: reviews.length,
      ratingDistribution: distribution,
    };
  }

  async findOne(id: string): Promise<ReviewResponseDto> {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: { visitor: { select: { firstName: true, lastName: true, avatarUrl: true } } },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return this.toResponseDto(review);
  }

  /** Can the given visitor leave a review for this booking right now? Used
   * by the app to decide whether to show a "Leave a review" prompt. */
  async getEligibility(
    visitorId: string,
    bookingId: string,
  ): Promise<{ eligible: boolean; reason?: string }> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { review: true },
    });

    if (!booking || booking.visitorId !== visitorId) {
      return { eligible: false, reason: 'Booking not found' };
    }
    if (booking.status !== BookingStatus.COMPLETED) {
      return { eligible: false, reason: 'Stay not yet complete' };
    }
    if (booking.review) {
      return { eligible: false, reason: 'Already reviewed' };
    }
    return { eligible: true };
  }

  async update(visitorId: string, id: string, dto: UpdateReviewDto): Promise<ReviewResponseDto> {
    const existing = await this.prisma.review.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Review not found');
    }
    if (existing.visitorId !== visitorId) {
      throw new ForbiddenException('You can only edit your own reviews');
    }

    const review = await this.prisma.review.update({
      where: { id },
      data: {
        rating: dto.rating ?? existing.rating,
        comment: dto.comment ?? existing.comment,
      },
      include: { visitor: { select: { firstName: true, lastName: true, avatarUrl: true } } },
    });

    await this.recomputePropertyRating(existing.propertyId);
    await this.recomputeHostRating(existing.hostId);

    return this.toResponseDto(review);
  }

  async remove(userId: string, isAdmin: boolean, id: string): Promise<void> {
    const existing = await this.prisma.review.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Review not found');
    }
    if (existing.visitorId !== userId && !isAdmin) {
      throw new ForbiddenException('You can only delete your own reviews');
    }

    await this.prisma.review.delete({ where: { id } });

    await this.recomputePropertyRating(existing.propertyId);
    await this.recomputeHostRating(existing.hostId);
  }

  async respond(hostId: string, id: string, dto: RespondToReviewDto): Promise<ReviewResponseDto> {
    const existing = await this.prisma.review.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Review not found');
    }
    if (existing.hostId !== hostId) {
      throw new ForbiddenException('You can only respond to reviews on your own properties');
    }

    const review = await this.prisma.review.update({
      where: { id },
      data: { hostResponse: dto.response, hostRespondedAt: new Date() },
      include: { visitor: { select: { firstName: true, lastName: true, avatarUrl: true } } },
    });

    return this.toResponseDto(review);
  }

  private async recomputePropertyRating(propertyId: string): Promise<void> {
    const agg = await this.prisma.review.aggregate({
      where: { propertyId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        averageRating: agg._avg.rating || 0,
        reviewCount: agg._count.rating,
      },
    });
  }

  private async recomputeHostRating(hostId: string): Promise<void> {
    const agg = await this.prisma.review.aggregate({
      where: { hostId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await this.prisma.user.update({
      where: { id: hostId },
      data: {
        hostRating: agg._avg.rating || 0,
        hostReviewCount: agg._count.rating,
      },
    });
  }

  private toResponseDto(review: {
    id: string;
    bookingId: string;
    propertyId: string;
    visitorId: string;
    hostId: string;
    rating: number;
    comment: string | null;
    hostResponse: string | null;
    hostRespondedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    visitor: { firstName: string; lastName: string; avatarUrl: string | null };
  }): ReviewResponseDto {
    return {
      id: review.id,
      bookingId: review.bookingId,
      propertyId: review.propertyId,
      visitorId: review.visitorId,
      visitorName: `${review.visitor.firstName} ${review.visitor.lastName}`,
      visitorAvatarUrl: review.visitor.avatarUrl,
      hostId: review.hostId,
      rating: review.rating,
      comment: review.comment,
      hostResponse: review.hostResponse,
      hostRespondedAt: review.hostRespondedAt,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }
}
