import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WithdrawalStatus } from '@prisma/client';
import { EarningsService } from '../earnings/earnings.service';
import { PaginationUtil, PaginatedResult } from '../common/utils/pagination.util';
import { PushNotificationService } from '../common/services/push-notification.service';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { WithdrawalResponseDto } from './dto/withdrawal-response.dto';
import Decimal from 'decimal.js';

@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly earningsService: EarningsService,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  async create(
    hostId: string,
    createWithdrawalDto: CreateWithdrawalDto,
  ): Promise<WithdrawalResponseDto> {
    const { amount, bankName, bankCode, accountNumber, accountName } = createWithdrawalDto;

    // Check minimum withdrawal amount
    if (amount < 1000) {
      throw new BadRequestException('Minimum withdrawal amount is 1000 NGN');
    }

    // Check available balance
    const summary = await this.earningsService.getEarningsSummary(hostId);
    if (summary.availableBalance < amount) {
      throw new BadRequestException('Insufficient available balance');
    }

    // Check for pending withdrawals
    const pendingWithdrawals = await this.prisma.withdrawalRequest.count({
      where: {
        hostId,
        status: { in: [WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING] },
      },
    });

    if (pendingWithdrawals > 0) {
      throw new BadRequestException('You already have a pending withdrawal request');
    }

    // Create withdrawal request
    const withdrawal = await this.prisma.withdrawalRequest.create({
      data: {
        hostId,
        amount,
        currency: 'NGN',
        bankName,
        bankCode,
        accountNumber,
        accountName,
        status: WithdrawalStatus.PENDING,
      },
    });

    // Deduct from earnings
    await this.earningsService.deductForWithdrawal(hostId, amount, withdrawal.id);

    this.logger.log(`Withdrawal request created: ${withdrawal.id} for ${amount} NGN`);

    // Convert Decimal values to numbers for the response
    return {
      ...withdrawal,
      amount: Number(withdrawal.amount),
    } as unknown as WithdrawalResponseDto;
  }

  async findByHost(
    hostId: string,
    options: { page: number; limit: number },
  ): Promise<PaginatedResult<WithdrawalResponseDto>> {
    const { page, limit } = options;
    const skip = PaginationUtil.calculateSkip({ page, limit });

    const [withdrawals, total] = await Promise.all([
      this.prisma.withdrawalRequest.findMany({
        where: { hostId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.withdrawalRequest.count({ where: { hostId } }),
    ]);

    // Convert Decimal values to numbers for the response
    const convertedWithdrawals = withdrawals.map(withdrawal => ({
      ...withdrawal,
      amount: Number(withdrawal.amount),
    }));

    return PaginationUtil.createResult(
      convertedWithdrawals as WithdrawalResponseDto[],
      total,
      { page, limit },
    );
  }

  async findAll(options: {
    status?: WithdrawalStatus;
    page: number;
    limit: number;
  }): Promise<PaginatedResult<WithdrawalResponseDto>> {
    const { status, page, limit } = options;
    const skip = PaginationUtil.calculateSkip({ page, limit });

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [withdrawals, total] = await Promise.all([
      this.prisma.withdrawalRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          host: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.withdrawalRequest.count({ where }),
    ]);

    // Convert Decimal values to numbers for the response
    const convertedWithdrawals = withdrawals.map(withdrawal => ({
      ...withdrawal,
      amount: Number(withdrawal.amount),
      host: withdrawal.host, // keep host as is since it's already properly typed
    }));

    return PaginationUtil.createResult(
      convertedWithdrawals as WithdrawalResponseDto[],
      total,
      { page, limit },
    );
  }

  async findOne(id: string): Promise<WithdrawalResponseDto> {
    const withdrawal = await this.prisma.withdrawalRequest.findUnique({
      where: { id },
    });

    if (!withdrawal) {
      throw new NotFoundException('Withdrawal request not found');
    }

    // Convert Decimal values to numbers for the response
    return {
      ...withdrawal,
      amount: Number(withdrawal.amount),
    } as unknown as WithdrawalResponseDto;
  }

  async processWithdrawal(
    id: string,
    adminId: string,
    status: WithdrawalStatus,
    transferReference?: string,
    failureReason?: string,
  ): Promise<WithdrawalResponseDto> {
    const withdrawal = await this.prisma.withdrawalRequest.findUnique({
      where: { id },
    });

    if (!withdrawal) {
      throw new NotFoundException('Withdrawal request not found');
    }

    // A payout is two admin actions, not one: approve it (PROCESSING, "I
    // accept this and am going to send the transfer"), then mark it paid
    // (COMPLETED, "the money has left the account"). Only allowing
    // transitions out of PENDING meant the second action always failed with
    // "not pending", because approving had already moved it on.
    const allowedFrom: Record<string, WithdrawalStatus[]> = {
      [WithdrawalStatus.PROCESSING]: [WithdrawalStatus.PENDING],
      [WithdrawalStatus.COMPLETED]: [WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING],
      [WithdrawalStatus.FAILED]: [WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING],
    };

    const permitted = allowedFrom[status];
    if (!permitted) {
      throw new BadRequestException(
        `A withdrawal cannot be moved to '${status}' from here.`,
      );
    }
    if (!permitted.includes(withdrawal.status)) {
      throw new BadRequestException(
        `This withdrawal is already '${withdrawal.status}' and cannot be marked '${status}' again.`,
      );
    }

    const updateData: any = {
      status,
      processedBy: adminId,
      processedAt: new Date(),
    };

    if (status === WithdrawalStatus.COMPLETED) {
      updateData.transferReference = transferReference;
    }

    if (status === WithdrawalStatus.FAILED) {
      updateData.failureReason = failureReason;
    }

    const updatedWithdrawal = await this.prisma.withdrawalRequest.update({
      where: { id },
      data: updateData,
    });

    if (status === WithdrawalStatus.FAILED) {
      await this.earningsService.refundWithdrawal(withdrawal.hostId, Number(withdrawal.amount), id);
    }

    this.logger.log(`Withdrawal ${id} processed with status: ${status}`);

    const formattedAmount = new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(Number(withdrawal.amount));

    if (status === WithdrawalStatus.COMPLETED) {
      void this.pushNotificationService.sendToUser(withdrawal.hostId, {
        title: 'Withdrawal Completed',
        body: `Your withdrawal of ${formattedAmount} has been sent to your bank account.`,
        data: { type: 'withdrawal', withdrawalId: id },
      });
    } else if (status === WithdrawalStatus.FAILED) {
      void this.pushNotificationService.sendToUser(withdrawal.hostId, {
        title: 'Withdrawal Failed',
        body: failureReason
          ? `Your withdrawal of ${formattedAmount} failed: ${failureReason}`
          : `Your withdrawal of ${formattedAmount} could not be processed.`,
        data: { type: 'withdrawal', withdrawalId: id },
      });
    }

    // Convert Decimal values to numbers for the response
    return {
      ...updatedWithdrawal,
      amount: Number(updatedWithdrawal.amount),
    } as unknown as WithdrawalResponseDto;
  }

  async cancelWithdrawal(hostId: string, id: string): Promise<WithdrawalResponseDto> {
    const withdrawal = await this.prisma.withdrawalRequest.findUnique({
      where: { id },
    });

    if (!withdrawal) {
      throw new NotFoundException('Withdrawal request not found');
    }

    if (withdrawal.hostId !== hostId) {
      throw new ForbiddenException('You can only cancel your own withdrawal requests');
    }

    if (withdrawal.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException('Only pending withdrawals can be cancelled');
    }

    const updatedWithdrawal = await this.prisma.withdrawalRequest.update({
      where: { id },
      data: {
        status: WithdrawalStatus.CANCELLED,
      },
    });

    await this.earningsService.refundWithdrawal(hostId, Number(withdrawal.amount), id);

    this.logger.log(`Withdrawal ${id} cancelled by host`);

    // Convert Decimal values to numbers for the response
    return {
      ...updatedWithdrawal,
      amount: Number(updatedWithdrawal.amount),
    } as unknown as WithdrawalResponseDto;
  }

  async getWithdrawalStats() {
    const [pending, processing, completed, failed, total, totalAmount] = await Promise.all([
      this.prisma.withdrawalRequest.count({ where: { status: WithdrawalStatus.PENDING } }),
      this.prisma.withdrawalRequest.count({ where: { status: WithdrawalStatus.PROCESSING } }),
      this.prisma.withdrawalRequest.count({ where: { status: WithdrawalStatus.COMPLETED } }),
      this.prisma.withdrawalRequest.count({ where: { status: WithdrawalStatus.FAILED } }),
      this.prisma.withdrawalRequest.count(),
      this.prisma.withdrawalRequest.aggregate({
        where: { status: WithdrawalStatus.COMPLETED },
        _sum: { amount: true },
      }),
    ]);

    return {
      pending,
      processing,
      completed,
      failed,
      total,
      totalAmount: totalAmount._sum.amount || 0,
    };
  }
}
