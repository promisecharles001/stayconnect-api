import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus, PropertyStatus, EscrowStatus } from '@prisma/client';
import { PaginationUtil, PaginatedResult } from '../common/utils/pagination.util';
import { PushNotificationService } from '../common/services/push-notification.service';
import { EarningsService } from '../earnings/earnings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto, VerifyPaymentDto, RefundBookingDto } from './dto/update-booking.dto';
import { BookingResponseDto } from './dto/booking-response.dto';
import Decimal from 'decimal.js';
import { randomUUID } from 'crypto';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly earningsService: EarningsService,
  ) {}

  /**
   * The transfer reference for a booking id: 'BK-' plus its first 8 hex
   * characters, uppercased. Short because it is typed into a bank narration
   * field, and unchanged from what the client used to derive so codes
   * already given to visitors keep resolving.
   */
  private static referenceFor(bookingId: string): string {
    return `BK-${bookingId.slice(0, 8).toUpperCase()}`;
  }

  /**
   * Insert a booking with its id and reference generated together.
   *
   * Retries on a unique-constraint violation (Prisma P2002) with a fresh id.
   * A clash needs two uuids to agree on their first 8 hex characters, so
   * this should never fire — but a booking failing because of it would be a
   * poor way to find that out.
   */
  private async createWithUniqueReference(data: {
    visitorId: string;
    hostId: string;
    propertyId: string;
    startDate: Date;
    endDate: Date;
    totalAmount: number;
    commissionAmount: number;
    status: BookingStatus;
  }) {
    const include = {
      property: { select: { id: true, title: true, images: true } },
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      const id = randomUUID();
      try {
        return await this.prisma.booking.create({
          data: { id, reference: BookingsService.referenceFor(id), ...data },
          include,
        });
      } catch (error: any) {
        const isDuplicateReference =
          error?.code === 'P2002' &&
          (error?.meta?.target as string[] | undefined)?.includes('reference');
        if (!isDuplicateReference) throw error;
        this.logger.warn(`Booking reference collision on attempt ${attempt + 1}; retrying`);
      }
    }

    throw new BadRequestException(
      'Could not allocate a booking reference. Please try again.',
    );
  }

  async create(visitorId: string, createBookingDto: CreateBookingDto): Promise<BookingResponseDto> {
    const { propertyId, startDate, endDate, totalAmount } = createBookingDto;

    // Check if property exists and is approved
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    if (property.status !== PropertyStatus.APPROVED) {
      throw new BadRequestException('This property is not available for booking');
    }

    // Prevent self-booking
    if (property.hostId === visitorId) {
      throw new BadRequestException('You cannot book your own property');
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (start < today) {
      throw new BadRequestException('Start date cannot be in the past');
    }

    if (end <= start) {
      throw new BadRequestException('End date must be after start date');
    }

    // Prevent double-booking: reject if this property already has an
    // active (pending or accepted) booking whose date range overlaps the
    // requested one. Rejected/completed bookings don't block — only ones
    // that still hold the calendar.
    const overlapping = await this.prisma.booking.findFirst({
      where: {
        propertyId,
        status: { in: [BookingStatus.PENDING, BookingStatus.ACCEPTED] },
        startDate: { lt: end },
        endDate: { gt: start },
      },
    });

    if (overlapping) {
      throw new BadRequestException(
        'This property is already booked (or has a pending request) for some of the selected dates. Please choose different dates.',
      );
    }

    // Calculate commission (based on property's commission percent)
    const commissionAmount = (totalAmount * Number(property.commissionPercent)) / 100;

    // Create booking.
    //
    // The id is generated here rather than by the database so the transfer
    // reference can be derived from it and stored in the same insert — the
    // visitor is shown this code to put in their bank transfer, and an admin
    // matches it against the statement, so it has to exist from the start.
    // `reference` is unique; on the vanishingly unlikely chance two ids share
    // their first 8 hex characters, take a fresh id rather than fail a
    // booking someone is trying to make.
    const booking = await this.createWithUniqueReference({
      visitorId,
      hostId: property.hostId,
      propertyId,
      startDate: start,
      endDate: end,
      totalAmount,
      commissionAmount,
      status: BookingStatus.PENDING,
    });

    this.logger.log(`Booking created: ${booking.id} for property: ${property.title}`);

    void this.pushNotificationService.sendToUser(property.hostId, {
      title: 'New Booking Request',
      body: `You have a new booking request for "${property.title}"`,
      data: { type: 'booking', bookingId: booking.id },
    });

    // Convert Decimal values to numbers for the response
    return {
      ...booking,
      totalAmount: Number(booking.totalAmount),
      commissionAmount: Number(booking.commissionAmount),
    } as unknown as BookingResponseDto;
  }

  async findByGuest(
    visitorId: string,
    options: { page: number; limit: number },
  ): Promise<PaginatedResult<BookingResponseDto>> {
    const { page, limit } = options;
    const skip = PaginationUtil.calculateSkip({ page, limit });

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where: { visitorId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          property: {
            select: {
              id: true,
              title: true,
              images: true,
            },
          },
          host: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        },
      }),
      this.prisma.booking.count({ where: { visitorId } }),
    ]);

    // Convert Decimal values to numbers for the response, and only include host if payment is verified
    const convertedBookings = bookings.map(booking => {
      const baseBooking = {
        ...booking,
        totalAmount: Number(booking.totalAmount),
        commissionAmount: Number(booking.commissionAmount),
      };
      // Remove host info if payment is not verified
      if (!booking.paymentVerified) {
        delete (baseBooking as any).host;
      }
      return baseBooking;
    });

    return PaginationUtil.createResult(convertedBookings as BookingResponseDto[], total, { page, limit });
  }

  async findByHost(
    hostId: string,
    options: { page: number; limit: number; status?: BookingStatus },
  ): Promise<PaginatedResult<BookingResponseDto>> {
    const { page, limit, status } = options;
    const skip = PaginationUtil.calculateSkip({ page, limit });

    // The status filter is what the "Booking Requests" screen relies on to
    // show only what still needs a decision. It used to be dropped on the
    // floor by the controller, so that screen listed every booking the host
    // had ever received — including ones already accepted, which reappeared
    // as fresh requests on every visit and could be accepted a second time.
    const where = status ? { hostId, status } : { hostId };

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          property: {
            select: {
              id: true,
              title: true,
              images: true,
            },
          },
          visitor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    // Convert Decimal values to numbers for the response
    const convertedBookings = bookings.map(booking => ({
      ...booking,
      totalAmount: Number(booking.totalAmount),
      commissionAmount: Number(booking.commissionAmount),
    }));

    return PaginationUtil.createResult(convertedBookings as BookingResponseDto[], total, { page, limit });
  }

  /**
   * Admin view: bookings that need a payment/escrow decision — payment
   * proof uploaded but not yet verified, or verified and held pending
   * release/refund. Pass escrowStatus to narrow to one stage.
   */
  async findAllAdmin(
    options: { page: number; limit: number; escrowStatus?: EscrowStatus; search?: string },
  ): Promise<PaginatedResult<BookingResponseDto>> {
    const { page, limit, escrowStatus, search } = options;
    const skip = PaginationUtil.calculateSkip({ page, limit });

    // Searching by reference is how an admin reconciles a bank statement, so
    // it deliberately ignores the escrow filter and the "has proof" default:
    // the whole point is to find a booking you only know the code for,
    // including one whose visitor hasn't uploaded proof yet. The BK- prefix
    // is optional, so pasting either the bare code or the full one works.
    if (search?.trim()) {
      const term = search.trim().replace(/^BK-/i, '');
      const where = {
        OR: [
          { reference: { contains: term, mode: 'insensitive' as const } },
          { id: { startsWith: term.toLowerCase() } },
        ],
      };
      return this.runAdminBookingQuery(where, { page, limit, skip });
    }

    const where = escrowStatus
      ? { escrowStatus }
      : { paymentProof: { not: null } };

    return this.runAdminBookingQuery(where, { page, limit, skip });
  }

  /** Shared fetch/shape for the admin booking list, filtered or searched. */
  private async runAdminBookingQuery(
    where: any,
    { page, limit, skip }: { page: number; limit: number; skip: number },
  ): Promise<PaginatedResult<BookingResponseDto>> {
    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          property: { select: { id: true, title: true, images: true } },
          visitor: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          host: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    const convertedBookings = bookings.map(booking => ({
      ...booking,
      // Never hand out a null reference: the column is nullable only so the
      // deploy could add it to a table with existing rows, and the seed
      // backfills straight after. Deriving covers the gap between the two.
      reference: booking.reference ?? BookingsService.referenceFor(booking.id),
      totalAmount: Number(booking.totalAmount),
      commissionAmount: Number(booking.commissionAmount),
      refundAmount: booking.refundAmount ? Number(booking.refundAmount) : null,
    }));

    return PaginationUtil.createResult(convertedBookings as BookingResponseDto[], total, { page, limit });
  }

  async findOne(id: string): Promise<BookingResponseDto> {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            images: true,
          },
        },
        host: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID '${id}' not found`);
    }

    // Convert Decimal values to numbers for the response, and only include host if payment is verified
    const baseBooking = {
      ...booking,
      totalAmount: Number(booking.totalAmount),
      commissionAmount: Number(booking.commissionAmount),
    };
    // Remove host info if payment is not verified
    if (!booking.paymentVerified) {
      delete (baseBooking as any).host;
    }
    return baseBooking as unknown as BookingResponseDto;
  }

  /**
   * Attach proof of payment to a booking.
   *
   * Separate from updateStatus because that one is host-only, and it is the
   * visitor who pays — without this the escrow chain could never start:
   * verifyPayment refuses to run until a booking has a paymentProof.
   */
  async submitPaymentProof(
    id: string,
    visitorId: string,
    paymentProof: string,
  ): Promise<BookingResponseDto> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });

    if (!booking) {
      throw new NotFoundException(`Booking with ID '${id}' not found`);
    }

    if (booking.visitorId !== visitorId) {
      throw new ForbiddenException('Only the visitor who booked can submit payment proof');
    }

    if (booking.paymentVerified) {
      throw new BadRequestException('Payment has already been verified for this booking');
    }

    const updatedBooking = await this.prisma.booking.update({
      where: { id },
      data: { paymentProof },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            images: true,
          },
        },
      },
    });

    this.logger.log(`Payment proof submitted for booking ${id}`);

    return updatedBooking as unknown as BookingResponseDto;
  }

  async updateStatus(
    id: string,
    userId: string,
    updateBookingDto: UpdateBookingDto,
  ): Promise<BookingResponseDto> {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID '${id}' not found`);
    }

    // Check permissions - only host can update status
    if (booking.hostId !== userId) {
      throw new ForbiddenException('Only the host can update booking status');
    }

    const { status, paymentProof } = updateBookingDto;

    // Validate status transitions
    if (status === BookingStatus.REJECTED && booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException('Can only reject pending bookings');
    }

    const updateData: any = {};
    if (status) updateData.status = status;
    if (paymentProof) updateData.paymentProof = paymentProof;

    const updatedBooking = await this.prisma.booking.update({
      where: { id },
      data: updateData,
      include: {
        property: {
          select: {
            id: true,
            title: true,
            images: true,
          },
        },
      },
    });

    this.logger.log(`Booking ${id} updated`);

    if (status) {
      const statusText = status === BookingStatus.ACCEPTED ? 'accepted' : status.toLowerCase();
      void this.pushNotificationService.sendToUser(booking.visitorId, {
        title: 'Booking Update',
        body: `Your booking for "${updatedBooking.property.title}" was ${statusText}`,
        data: { type: 'booking', bookingId: id, status },
      });
    }

    // Convert Decimal values to numbers for the response
    return {
      ...updatedBooking,
      totalAmount: Number(updatedBooking.totalAmount),
      commissionAmount: Number(updatedBooking.commissionAmount),
    } as unknown as BookingResponseDto;
  }

  async verifyPayment(
    id: string,
    adminId: string,
    verifyDto: VerifyPaymentDto,
  ): Promise<BookingResponseDto> {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID '${id}' not found`);
    }

    if (!booking.paymentProof) {
      throw new BadRequestException('No payment proof uploaded for this booking');
    }

    const updatedBooking = await this.prisma.booking.update({
      where: { id },
      data: {
        paymentVerified: verifyDto.verified,
        verifiedAt: verifyDto.verified ? new Date() : null,
        verifiedBy: verifyDto.verified ? adminId : null,
        // Verified payment means the admin is holding the funds pending the
        // visitor's in-person inspection outcome — not yet paid out to the
        // host. See releaseFunds()/refundBooking() for the next step.
        escrowStatus: verifyDto.verified ? EscrowStatus.HELD : EscrowStatus.PENDING,
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            images: true,
          },
        },
        host: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    this.logger.log(`Payment for booking ${id} ${verifyDto.verified ? 'verified' : 'unverified'} by admin`);

    if (verifyDto.verified) {
      void this.pushNotificationService.sendToUser(booking.visitorId, {
        title: 'Payment Verified',
        body: `Your payment for "${updatedBooking.property.title}" has been verified. Your booking is confirmed!`,
        data: { type: 'booking', bookingId: id },
      });
    }

    // Convert Decimal values to numbers for the response, and only include host if payment is verified
    const baseBooking = {
      ...updatedBooking,
      totalAmount: Number(updatedBooking.totalAmount),
      commissionAmount: Number(updatedBooking.commissionAmount),
    };
    // Remove host info if payment is not verified
    if (!updatedBooking.paymentVerified) {
      delete (baseBooking as any).host;
    }
    return baseBooking as unknown as BookingResponseDto;
  }

  /**
   * Admin releases held funds to the host after the visitor has confirmed
   * (in person / via chat) that the apartment matches the listing. This is
   * the only path that credits a host's earnings ledger for a booking.
   */
  async releaseFunds(id: string, adminId: string): Promise<BookingResponseDto> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });

    if (!booking) {
      throw new NotFoundException(`Booking with ID '${id}' not found`);
    }

    if (booking.escrowStatus !== EscrowStatus.HELD) {
      throw new BadRequestException(
        `Cannot release funds for a booking in escrow status '${booking.escrowStatus}'. Only HELD bookings can be released.`,
      );
    }

    const hostAmount = new Decimal(booking.totalAmount).minus(booking.commissionAmount).toNumber();

    const updatedBooking = await this.prisma.booking.update({
      where: { id },
      data: {
        escrowStatus: EscrowStatus.RELEASED,
        fundsReleasedAt: new Date(),
        fundsReleasedBy: adminId,
      },
      include: {
        property: { select: { id: true, title: true, images: true } },
        host: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      },
    });

    await this.earningsService.addEarning(
      booking.hostId,
      hostAmount,
      `Booking payout for "${updatedBooking.property.title}"`,
      booking.id,
    );

    this.logger.log(`Funds released for booking ${id}: ${hostAmount} credited to host ${booking.hostId}`);

    void this.pushNotificationService.sendToUser(booking.hostId, {
      title: 'Funds released',
      body: `Payment for "${updatedBooking.property.title}" has been released to your earnings balance.`,
      data: { type: 'booking', bookingId: id },
    });

    return {
      ...updatedBooking,
      totalAmount: Number(updatedBooking.totalAmount),
      commissionAmount: Number(updatedBooking.commissionAmount),
    } as unknown as BookingResponseDto;
  }

  /**
   * Admin refunds the visitor (minus an inspection/platform fee) after the
   * visitor rejects the apartment following an in-person inspection. Money
   * itself moves outside the app (bank transfer), same as payment proof —
   * this just records the outcome.
   */
  async refundBooking(id: string, adminId: string, refundDto: RefundBookingDto): Promise<BookingResponseDto> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });

    if (!booking) {
      throw new NotFoundException(`Booking with ID '${id}' not found`);
    }

    if (booking.escrowStatus !== EscrowStatus.HELD) {
      throw new BadRequestException(
        `Cannot refund a booking in escrow status '${booking.escrowStatus}'. Only HELD bookings can be refunded.`,
      );
    }

    // A refund returns everything the visitor paid. No fee is retained.
    //
    // This used to subtract a caller-supplied feeAmount, and the admin app
    // passed the commission, so a refunded visitor silently got back less
    // than they paid. The amount is decided here rather than by the caller
    // so no client can change what a refund is worth; feeAmount is still
    // accepted and ignored, so older app versions don't break.
    const refundAmount = new Decimal(booking.totalAmount).toNumber();

    const updatedBooking = await this.prisma.booking.update({
      where: { id },
      data: {
        escrowStatus: EscrowStatus.REFUNDED,
        refundedAt: new Date(),
        refundedBy: adminId,
        refundAmount,
        refundReason: refundDto.reason,
      },
      include: {
        property: { select: { id: true, title: true, images: true } },
        host: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      },
    });

    this.logger.log(`Booking ${id} refunded in full: ${refundAmount} to visitor ${booking.visitorId}`);

    void this.pushNotificationService.sendToUser(booking.visitorId, {
      title: 'Refund processed',
      body: `You've been refunded ₦${refundAmount.toLocaleString()} for "${updatedBooking.property.title}".`,
      data: { type: 'booking', bookingId: id },
    });

    // Refunded bookings are no longer "paid" — host contact goes back to hidden.
    const baseBooking = {
      ...updatedBooking,
      totalAmount: Number(updatedBooking.totalAmount),
      commissionAmount: Number(updatedBooking.commissionAmount),
    };
    delete (baseBooking as any).host;
    return baseBooking as unknown as BookingResponseDto;
  }

  async getBookingStats(userId: string, isHost: boolean) {
    const where = isHost ? { hostId: userId } : { visitorId: userId };

    const [total, pending, accepted, completed] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.count({ where: { ...where, status: BookingStatus.PENDING } }),
      this.prisma.booking.count({ where: { ...where, status: BookingStatus.ACCEPTED } }),
      this.prisma.booking.count({ where: { ...where, status: BookingStatus.COMPLETED } }),
    ]);

    // Calculate total amount
    const totalAmount = await this.prisma.booking.aggregate({
      where: { ...where, status: { not: BookingStatus.REJECTED } },
      _sum: { totalAmount: true },
    });

    return {
      total,
      pending,
      accepted,
      completed,
      totalAmount: totalAmount._sum.totalAmount || 0,
    };
  }
}
