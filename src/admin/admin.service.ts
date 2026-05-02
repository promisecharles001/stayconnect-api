import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatus, PropertyStatus, BookingStatus, KYCStatus, WithdrawalStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats() {
    const [
      totalUsers,
      totalHosts,
      totalGuests,
      totalProperties,
      approvedProperties,
      pendingProperties,
      totalBookings,
      pendingBookings,
      acceptedBookings,
      completedBookings,
      totalRevenue,
      pendingKyc,
      pendingWithdrawals,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: { name: 'HOST' } } }),
      this.prisma.user.count({ where: { role: { name: 'GUEST' } } }),
      this.prisma.property.count(),
      this.prisma.property.count({ where: { status: PropertyStatus.APPROVED } }),
      this.prisma.property.count({ where: { status: PropertyStatus.PENDING_APPROVAL } }),
      this.prisma.booking.count(),
      this.prisma.booking.count({ where: { status: BookingStatus.PENDING } }),
      this.prisma.booking.count({ where: { status: BookingStatus.ACCEPTED } }),
      this.prisma.booking.count({ where: { status: BookingStatus.COMPLETED } }),
      this.prisma.booking.aggregate({
        where: { status: { not: BookingStatus.REJECTED } },
        _sum: { totalAmount: true },
      }),
      this.prisma.kYCVerification.count({ where: { status: KYCStatus.PENDING } }),
      this.prisma.withdrawalRequest.count({
        where: { status: { in: [WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING] } },
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        hosts: totalHosts,
        guests: totalGuests,
      },
      properties: {
        total: totalProperties,
        approved: approvedProperties,
        pending: pendingProperties,
      },
      bookings: {
        total: totalBookings,
        pending: pendingBookings,
        accepted: acceptedBookings,
        completed: completedBookings,
      },
      revenue: {
        total: totalRevenue._sum.totalAmount || 0,
      },
      pendingActions: {
        kyc: pendingKyc,
        withdrawals: pendingWithdrawals,
        properties: pendingProperties,
      },
    };
  }

  async getUserStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      totalUsers,
      activeUsers,
      pendingUsers,
      suspendedUsers,
      newThisMonth,
      newLastMonth,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      this.prisma.user.count({ where: { status: UserStatus.PENDING_VERIFICATION } }),
      this.prisma.user.count({ where: { status: UserStatus.SUSPENDED } }),
      this.prisma.user.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      this.prisma.user.count({
        where: {
          createdAt: {
            gte: startOfLastMonth,
            lte: endOfLastMonth,
          },
        },
      }),
    ]);

    return {
      total: totalUsers,
      active: activeUsers,
      pending: pendingUsers,
      suspended: suspendedUsers,
      growth: {
        thisMonth: newThisMonth,
        lastMonth: newLastMonth,
      },
    };
  }

  async getPropertyStats() {
    const [
      total,
      draft,
      pendingApproval,
      approved,
      rejected,
      suspended,
      byType,
      byCity,
    ] = await Promise.all([
      this.prisma.property.count(),
      this.prisma.property.count({ where: { status: PropertyStatus.DRAFT } }),
      this.prisma.property.count({ where: { status: PropertyStatus.PENDING_APPROVAL } }),
      this.prisma.property.count({ where: { status: PropertyStatus.APPROVED } }),
      this.prisma.property.count({ where: { status: PropertyStatus.REJECTED } }),
      this.prisma.property.count({ where: { status: PropertyStatus.SUSPENDED } }),
      this.prisma.property.groupBy({
        by: ['propertyType'],
        _count: { id: true },
      }),
      this.prisma.property.groupBy({
        by: ['city'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
    ]);

    return {
      total,
      byStatus: {
        draft,
        pendingApproval,
        approved,
        rejected,
        suspended,
      },
      byType: byType.map((item) => ({
        type: item.propertyType,
        count: item._count.id,
      })),
      byCity: byCity.map((item) => ({
        city: item.city,
        count: item._count.id,
      })),
    };
  }

  async getBookingStats(startDate?: string, endDate?: string) {
    const dateFilter: any = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.lte = new Date(endDate);
    }

    const where = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    const [total, pending, accepted, completed, rejected, totalRevenue, averageBookingValue] =
      await Promise.all([
        this.prisma.booking.count({ where }),
        this.prisma.booking.count({ where: { ...where, status: BookingStatus.PENDING } }),
        this.prisma.booking.count({ where: { ...where, status: BookingStatus.ACCEPTED } }),
        this.prisma.booking.count({ where: { ...where, status: BookingStatus.COMPLETED } }),
        this.prisma.booking.count({ where: { ...where, status: BookingStatus.REJECTED } }),
        this.prisma.booking.aggregate({
          where: { ...where, status: { not: BookingStatus.REJECTED } },
          _sum: { totalAmount: true },
        }),
        this.prisma.booking.aggregate({
          where: { ...where, status: { not: BookingStatus.REJECTED } },
          _avg: { totalAmount: true },
        }),
      ]);

    return {
      total,
      byStatus: {
        pending,
        accepted,
        completed,
        rejected,
      },
      revenue: {
        total: totalRevenue._sum.totalAmount || 0,
        average: averageBookingValue._avg.totalAmount || 0,
      },
    };
  }

  async getRevenueStats(startDate?: string, endDate?: string) {
    const dateFilter: any = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.lte = new Date(endDate);
    }

    const where = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    const [totalRevenue, totalCommission] = await Promise.all([
      this.prisma.booking.aggregate({
        where: { ...where, status: { not: BookingStatus.REJECTED } },
        _sum: { totalAmount: true },
      }),
      this.prisma.booking.aggregate({
        where: { ...where, status: { not: BookingStatus.REJECTED } },
        _sum: { commissionAmount: true },
      }),
    ]);

    const totalRevenueValue = Number(totalRevenue._sum.totalAmount || 0);
    const totalCommissionValue = Number(totalCommission._sum.commissionAmount || 0);

    return {
      totalRevenue: totalRevenueValue,
      totalCommission: totalCommissionValue,
      hostEarnings: totalRevenueValue - totalCommissionValue,
    };
  }

  async getRecentActivities(page: number, limit: number) {
    const skip = (page - 1) * limit;

    // Since we removed AdminActivity model, return empty for now
    // This can be implemented later with a logging solution
    return {
      data: [],
      meta: {
        total: 0,
        page,
        limit,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
  }
}
