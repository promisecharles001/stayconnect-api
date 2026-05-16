import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus } from '@prisma/client';
import { PaginationUtil, PaginatedResult } from '../common/utils/pagination.util';
import { EarningsLedgerDto, EarningsSummaryDto, BookingEarningDto } from './dto/earnings-response.dto';

@Injectable()
export class EarningsService {
  private readonly logger = new Logger(EarningsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getEarningsLedger(
    hostId: string,
    options: { page: number; limit: number },
  ): Promise<PaginatedResult<EarningsLedgerDto>> {
    const { page, limit } = options;
    const skip = PaginationUtil.calculateSkip({ page, limit });

    const [entries, total] = await Promise.all([
      this.prisma.earningsLedger.findMany({
        where: { hostId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.earningsLedger.count({ where: { hostId } }),
    ]);

    // Convert Decimal values to numbers for the response
    const convertedEntries = entries.map(entry => ({
      ...entry,
      amount: Number(entry.amount),
      balanceBefore: Number(entry.balanceBefore),
      balanceAfter: Number(entry.balanceAfter),
    }));

    return PaginationUtil.createResult(convertedEntries as EarningsLedgerDto[], total, { page, limit });
  }

  async getEarningsSummary(hostId: string): Promise<EarningsSummaryDto> {
    // Get current date info
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Get all earnings for this host
    const allEarnings = await this.prisma.earningsLedger.findMany({
      where: { hostId },
    });

    // Calculate totals
    const totalEarnings = allEarnings.reduce((sum, entry) => sum + Number(entry.amount), 0);

    // Get available balance (last entry's balanceAfter)
    const lastEntry = await this.prisma.earningsLedger.findFirst({
      where: { hostId },
      orderBy: { createdAt: 'desc' },
    });
    const availableBalance = lastEntry ? Number(lastEntry.balanceAfter) : 0;

    // Calculate pending balance (from pending bookings)
    const pendingBookings = await this.prisma.booking.findMany({
      where: {
        hostId,
        status: { in: [BookingStatus.PENDING, BookingStatus.ACCEPTED] },
      },
    });
    const pendingBalance = pendingBookings.reduce(
      (sum, booking) => sum + (Number(booking.totalAmount) - Number(booking.commissionAmount)),
      0,
    );

    // Calculate total withdrawn
    const totalWithdrawn = allEarnings
      .filter((entry) => entry.type === 'withdrawal')
      .reduce((sum, entry) => sum + Math.abs(Number(entry.amount)), 0);

    // This month earnings
    const thisMonthEarnings = allEarnings
      .filter(
        (entry) =>
          entry.type === 'booking' &&
          new Date(entry.createdAt) >= startOfMonth,
      )
      .reduce((sum, entry) => sum + Number(entry.amount), 0);

    // Last month earnings
    const lastMonthEarnings = allEarnings
      .filter(
        (entry) =>
          entry.type === 'booking' &&
          new Date(entry.createdAt) >= startOfLastMonth &&
          new Date(entry.createdAt) <= endOfLastMonth,
      )
      .reduce((sum, entry) => sum + Number(entry.amount), 0);

    return {
      totalEarnings,
      availableBalance,
      pendingBalance,
      totalWithdrawn,
      thisMonthEarnings,
      lastMonthEarnings,
    };
  }

  async getEarningsBookings(
    hostId: string,
    options: { page: number; limit: number },
  ): Promise<PaginatedResult<BookingEarningDto>> {
    const { page, limit } = options;
    const skip = PaginationUtil.calculateSkip({ page, limit });

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where: { hostId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          property: { select: { title: true } },
          guest: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.booking.count({ where: { hostId } }),
    ]);

    const data = bookings.map((booking) => ({
      id: booking.id,
      propertyTitle: booking.property?.title || 'Unknown Property',
      guestName: `${booking.guest?.firstName || ''} ${booking.guest?.lastName || ''}`.trim() || 'Unknown Guest',
      amount: Number(booking.totalAmount),
      platformFee: Number(booking.commissionAmount),
      hostAmount: Number(booking.totalAmount) - Number(booking.commissionAmount),
      status: this.mapBookingStatusToEarningStatus(booking.status),
      createdAt: booking.createdAt,
    }));

    return PaginationUtil.createResult(data, total, { page, limit });
  }

  private mapBookingStatusToEarningStatus(status: BookingStatus): string {
    switch (status) {
      case 'PENDING':
        return 'PENDING';
      case 'ACCEPTED':
        return 'AVAILABLE';
      case 'COMPLETED':
        return 'AVAILABLE';
      case 'REJECTED':
        return 'CANCELLED';
      default:
        return 'PENDING';
    }
  }

  async addEarning(
    hostId: string,
    amount: number,
    description: string,
    bookingId?: string,
  ): Promise<EarningsLedgerDto> {
    // Get current balance
    const lastEntry = await this.prisma.earningsLedger.findFirst({
      where: { hostId },
      orderBy: { createdAt: 'desc' },
    });

    const balanceBefore = lastEntry ? Number(lastEntry.balanceAfter) : 0;
    const balanceAfter = balanceBefore + amount;

    const entry = await this.prisma.earningsLedger.create({
      data: {
        hostId,
        amount,
        type: 'booking',
        description,
        bookingId,
        balanceBefore,
        balanceAfter,
      },
    });

    this.logger.log(`Earning added for host ${hostId}: ${amount}`);

    // Convert Decimal values to numbers for the response
    return {
      ...entry,
      amount: Number(entry.amount),
      balanceBefore: Number(entry.balanceBefore),
      balanceAfter: Number(entry.balanceAfter),
    } as unknown as EarningsLedgerDto;
  }

  async deductForWithdrawal(
    hostId: string,
    amount: number,
    withdrawalId: string,
  ): Promise<EarningsLedgerDto> {
    // Get current balance
    const lastEntry = await this.prisma.earningsLedger.findFirst({
      where: { hostId },
      orderBy: { createdAt: 'desc' },
    });

    const balanceBefore = lastEntry ? Number(lastEntry.balanceAfter) : 0;

    if (balanceBefore < amount) {
      throw new NotFoundException('Insufficient balance');
    }

    const balanceAfter = balanceBefore - amount;

    const entry = await this.prisma.earningsLedger.create({
      data: {
        hostId,
        amount: -amount,
        type: 'withdrawal',
        description: 'Withdrawal request',
        withdrawalId,
        balanceBefore,
        balanceAfter,
      },
    });

    this.logger.log(`Withdrawal deducted for host ${hostId}: ${amount}`);

    // Convert Decimal values to numbers for the response
    return {
      ...entry,
      amount: Number(entry.amount),
      balanceBefore: Number(entry.balanceBefore),
      balanceAfter: Number(entry.balanceAfter),
    } as unknown as EarningsLedgerDto;
  }
}
