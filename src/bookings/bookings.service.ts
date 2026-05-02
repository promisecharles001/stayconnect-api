import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus, PropertyStatus } from '@prisma/client';
import { PaginationUtil, PaginatedResult } from '../common/utils/pagination.util';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto, VerifyPaymentDto } from './dto/update-booking.dto';
import { BookingResponseDto } from './dto/booking-response.dto';
import Decimal from 'decimal.js';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(guestId: string, createBookingDto: CreateBookingDto): Promise<BookingResponseDto> {
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
    if (property.hostId === guestId) {
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

    // Calculate commission (based on property's commission percent)
    const commissionAmount = (totalAmount * Number(property.commissionPercent)) / 100;

    // Create booking
    const booking = await this.prisma.booking.create({
      data: {
        guestId,
        hostId: property.hostId,
        propertyId,
        startDate: start,
        endDate: end,
        totalAmount,
        commissionAmount,
        status: BookingStatus.PENDING,
      },
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

    this.logger.log(`Booking created: ${booking.id} for property: ${property.title}`);

    // Convert Decimal values to numbers for the response
    return {
      ...booking,
      totalAmount: Number(booking.totalAmount),
      commissionAmount: Number(booking.commissionAmount),
    } as unknown as BookingResponseDto;
  }

  async findByGuest(
    guestId: string,
    options: { page: number; limit: number },
  ): Promise<PaginatedResult<BookingResponseDto>> {
    const { page, limit } = options;
    const skip = PaginationUtil.calculateSkip({ page, limit });

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where: { guestId },
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
        },
      }),
      this.prisma.booking.count({ where: { guestId } }),
    ]);

    // Convert Decimal values to numbers for the response
    const convertedBookings = bookings.map(booking => ({
      ...booking,
      totalAmount: Number(booking.totalAmount),
      commissionAmount: Number(booking.commissionAmount),
    }));

    return PaginationUtil.createResult(convertedBookings as BookingResponseDto[], total, { page, limit });
  }

  async findByHost(
    hostId: string,
    options: { page: number; limit: number },
  ): Promise<PaginatedResult<BookingResponseDto>> {
    const { page, limit } = options;
    const skip = PaginationUtil.calculateSkip({ page, limit });

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where: { hostId },
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
        },
      }),
      this.prisma.booking.count({ where: { hostId } }),
    ]);

    // Convert Decimal values to numbers for the response
    const convertedBookings = bookings.map(booking => ({
      ...booking,
      totalAmount: Number(booking.totalAmount),
      commissionAmount: Number(booking.commissionAmount),
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
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID '${id}' not found`);
    }

    // Convert Decimal values to numbers for the response
    return {
      ...booking,
      totalAmount: Number(booking.totalAmount),
      commissionAmount: Number(booking.commissionAmount),
    } as unknown as BookingResponseDto;
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
      },
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

    this.logger.log(`Payment for booking ${id} ${verifyDto.verified ? 'verified' : 'unverified'} by admin`);

    // Convert Decimal values to numbers for the response
    return {
      ...updatedBooking,
      totalAmount: Number(updatedBooking.totalAmount),
      commissionAmount: Number(updatedBooking.commissionAmount),
    } as unknown as BookingResponseDto;
  }

  async getBookingStats(userId: string, isHost: boolean) {
    const where = isHost ? { hostId: userId } : { guestId: userId };

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
