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
        visitors: totalGuests,
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
    const fetchLimit = Math.max(limit * (page + 1), 50);

    const [recentKycs, recentProperties, recentBookings, recentWithdrawals, recentUsers] =
      await Promise.all([
        this.prisma.kYCVerification.findMany({
          take: fetchLimit,
          orderBy: { updatedAt: 'desc' },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        }),
        this.prisma.property.findMany({
          take: fetchLimit,
          orderBy: { updatedAt: 'desc' },
          include: {
            host: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        }),
        this.prisma.booking.findMany({
          take: fetchLimit,
          orderBy: { updatedAt: 'desc' },
          include: {
            visitor: { select: { id: true, firstName: true, lastName: true } },
            property: { select: { title: true } },
          },
        }),
        this.prisma.withdrawalRequest.findMany({
          take: fetchLimit,
          orderBy: { updatedAt: 'desc' },
          include: {
            host: { select: { id: true, firstName: true, lastName: true } },
          },
        }),
        this.prisma.user.findMany({
          take: fetchLimit,
          orderBy: { createdAt: 'desc' },
          select: { id: true, firstName: true, lastName: true, email: true, createdAt: true },
        }),
      ]);

    const activities: Array<{
      id: string;
      type: string;
      description: string;
      timestamp: Date;
      metadata: Record<string, any>;
    }> = [];

    for (const kyc of recentKycs) {
      const name = `${kyc.user.firstName} ${kyc.user.lastName}`;
      activities.push({
        id: `kyc-submitted-${kyc.id}`,
        type: 'KYC_SUBMITTED',
        description: `${name} submitted KYC for verification`,
        timestamp: kyc.createdAt,
        metadata: { userId: kyc.userId, email: kyc.user.email },
      });
      if (kyc.status === KYCStatus.APPROVED || kyc.status === KYCStatus.REJECTED) {
        activities.push({
          id: `kyc-reviewed-${kyc.id}`,
          type: kyc.status === KYCStatus.APPROVED ? 'KYC_APPROVED' : 'KYC_REJECTED',
          description: `KYC for ${name} was ${kyc.status === KYCStatus.APPROVED ? 'approved' : 'rejected'}`,
          timestamp: kyc.updatedAt,
          metadata: { userId: kyc.userId, email: kyc.user.email },
        });
      }
    }

    for (const property of recentProperties) {
      const hostName = `${property.host.firstName} ${property.host.lastName}`;
      activities.push({
        id: `property-submitted-${property.id}`,
        type: 'PROPERTY_SUBMITTED',
        description: `${hostName} submitted property "${property.title}" for review`,
        timestamp: property.createdAt,
        metadata: { propertyId: property.id, hostEmail: property.host.email },
      });
      if (property.status === PropertyStatus.APPROVED || property.status === PropertyStatus.REJECTED) {
        activities.push({
          id: `property-reviewed-${property.id}`,
          type: property.status === PropertyStatus.APPROVED ? 'PROPERTY_APPROVED' : 'PROPERTY_REJECTED',
          description: `Property "${property.title}" by ${hostName} was ${property.status === PropertyStatus.APPROVED ? 'approved' : 'rejected'}`,
          timestamp: property.updatedAt,
          metadata: { propertyId: property.id, hostEmail: property.host.email },
        });
      }
    }

    for (const booking of recentBookings) {
      const visitorName = `${booking.visitor.firstName} ${booking.visitor.lastName}`;
      activities.push({
        id: `booking-created-${booking.id}`,
        type: 'BOOKING_CREATED',
        description: `${visitorName} created a booking for "${booking.property.title}"`,
        timestamp: booking.createdAt,
        metadata: { bookingId: booking.id },
      });
      if (booking.paymentVerified) {
        activities.push({
          id: `payment-verified-${booking.id}`,
          type: 'PAYMENT_VERIFIED',
          description: `Payment verified for "${booking.property.title}" — booked by ${visitorName}`,
          timestamp: booking.updatedAt,
          metadata: { bookingId: booking.id },
        });
      }
    }

    for (const withdrawal of recentWithdrawals) {
      const hostName = `${withdrawal.host.firstName} ${withdrawal.host.lastName}`;
      activities.push({
        id: `withdrawal-requested-${withdrawal.id}`,
        type: 'WITHDRAWAL_REQUESTED',
        description: `${hostName} requested a withdrawal of ₦${Number(withdrawal.amount).toLocaleString()}`,
        timestamp: withdrawal.createdAt,
        metadata: { withdrawalId: withdrawal.id, amount: Number(withdrawal.amount) },
      });
      if (withdrawal.status === WithdrawalStatus.COMPLETED || withdrawal.status === WithdrawalStatus.FAILED) {
        activities.push({
          id: `withdrawal-processed-${withdrawal.id}`,
          type: `WITHDRAWAL_${withdrawal.status}`,
          description: `Withdrawal for ${hostName} was ${withdrawal.status.toLowerCase()}`,
          timestamp: withdrawal.updatedAt,
          metadata: { withdrawalId: withdrawal.id, amount: Number(withdrawal.amount) },
        });
      }
    }

    for (const user of recentUsers) {
      activities.push({
        id: `user-registered-${user.id}`,
        type: 'USER_REGISTERED',
        description: `${user.firstName} ${user.lastName} registered (${user.email})`,
        timestamp: user.createdAt,
        metadata: { userId: user.id, email: user.email },
      });
    }

    activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const total = activities.length;
    const paginated = activities.slice(skip, skip + limit);

    return {
      data: paginated,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: skip + limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }
}
