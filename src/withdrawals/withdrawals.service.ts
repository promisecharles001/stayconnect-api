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
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { WithdrawalResponseDto } from './dto/withdrawal-response.dto';
import Decimal from 'decimal.js';

@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly earningsService: EarningsService,
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

    if (withdrawal.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException('Withdrawal request is not pending');
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
      // TODO: Refund the amount back to host's earnings
    }

    const updatedWithdrawal = await this.prisma.withdrawalRequest.update({
      where: { id },
      data: updateData,
    });

    this.logger.log(`Withdrawal ${id} processed with status: ${status}`);

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

    // TODO: Refund the amount back to host's earnings

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
