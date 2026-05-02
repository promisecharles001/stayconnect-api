import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { KYCStatus, UserStatus } from '@prisma/client';
import { NotificationService } from '../common/services/notification.service';
import { CreateKycDto } from './dto/create-kyc.dto';
import { ReviewKycDto } from './dto/review-kyc.dto';
import { KycResponseDto } from './dto/kyc-response.dto';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
  ) {}

  async submitKyc(userId: string, createKycDto: CreateKycDto): Promise<KycResponseDto> {
    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if KYC already exists
    const existingKyc = await this.prisma.kYCVerification.findUnique({
      where: { userId },
    });

    if (existingKyc) {
      if (existingKyc.status === KYCStatus.APPROVED) {
        throw new ConflictException('KYC has already been approved');
      }

      // Update existing KYC
      const kyc = await this.prisma.kYCVerification.update({
        where: { userId },
        data: {
          ...createKycDto,
          status: KYCStatus.PENDING,
          reviewedAt: null,
          reviewedBy: null,
          reviewNotes: null,
          rejectionReason: null,
        },
      });

      this.logger.log(`KYC resubmitted for user: ${user.email}`);

      // Notify admin
      const adminEmail = this.configService.get<string>('ADMIN_EMAIL') || 'stayconnectng@gmail.com';
      await this.notificationService.notifyNewKycSubmitted(
        adminEmail,
        `${user.firstName} ${user.lastName}`,
        user.email,
      );

      return kyc as KycResponseDto;
    }

    // Create new KYC
    const kyc = await this.prisma.kYCVerification.create({
      data: {
        ...createKycDto,
        userId,
        status: KYCStatus.PENDING,
      },
    });

    this.logger.log(`KYC submitted for user: ${user.email}`);

    // Notify admin
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL') || 'stayconnectng@gmail.com';
    await this.notificationService.notifyNewKycSubmitted(
      adminEmail,
      `${user.firstName} ${user.lastName}`,
      user.email,
    );

    return kyc as KycResponseDto;
  }

  async findByUserId(userId: string): Promise<KycResponseDto | null> {
    const kyc = await this.prisma.kYCVerification.findUnique({
      where: { userId },
    });

    return kyc as KycResponseDto | null;
  }

  async findById(id: string): Promise<KycResponseDto> {
    const kyc = await this.prisma.kYCVerification.findUnique({
      where: { id },
    });

    if (!kyc) {
      throw new NotFoundException('KYC verification not found');
    }

    return kyc as KycResponseDto;
  }

  async findAll(options: {
    status?: KYCStatus;
    page: number;
    limit: number;
  }): Promise<{ data: KycResponseDto[]; total: number }> {
    const { status, page, limit } = options;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [kycs, total] = await Promise.all([
      this.prisma.kYCVerification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.kYCVerification.count({ where }),
    ]);

    return { data: kycs as KycResponseDto[], total };
  }

  async reviewKyc(
    id: string,
    adminId: string,
    reviewKycDto: ReviewKycDto,
  ): Promise<KycResponseDto> {
    const { status, reviewNotes, rejectionReason } = reviewKycDto;

    const kyc = await this.prisma.kYCVerification.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!kyc) {
      throw new NotFoundException('KYC verification not found');
    }

    if (kyc.status === KYCStatus.APPROVED) {
      throw new BadRequestException('KYC has already been approved');
    }

    // Update KYC status
    const updatedKyc = await this.prisma.kYCVerification.update({
      where: { id },
      data: {
        status,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewNotes,
        rejectionReason: status === KYCStatus.REJECTED ? rejectionReason : null,
      },
    });

    // Update user status if KYC is approved
    if (status === KYCStatus.APPROVED) {
      await this.prisma.user.update({
        where: { id: kyc.userId },
        data: { status: UserStatus.ACTIVE },
      });
    }

    this.logger.log(`KYC ${status} for user: ${kyc.user.email}`);

    return updatedKyc as KycResponseDto;
  }

  async getKycStats() {
    const [pending, inReview, approved, rejected, total] = await Promise.all([
      this.prisma.kYCVerification.count({ where: { status: KYCStatus.PENDING } }),
      this.prisma.kYCVerification.count({ where: { status: KYCStatus.IN_REVIEW } }),
      this.prisma.kYCVerification.count({ where: { status: KYCStatus.APPROVED } }),
      this.prisma.kYCVerification.count({ where: { status: KYCStatus.REJECTED } }),
      this.prisma.kYCVerification.count(),
    ]);

    return {
      pending,
      inReview,
      approved,
      rejected,
      total,
    };
  }
}
