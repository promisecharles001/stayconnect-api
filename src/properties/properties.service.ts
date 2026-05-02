import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PropertyStatus } from '@prisma/client';
import { NotificationService } from '../common/services/notification.service';
import { PaginationUtil, PaginatedResult } from '../common/utils/pagination.util';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { QueryPropertiesDto } from './dto/query-properties.dto';
import { PropertyResponseDto } from './dto/property-response.dto';
import Decimal from 'decimal.js';

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
  ) {}

  async create(hostId: string, createPropertyDto: CreatePropertyDto): Promise<PropertyResponseDto> {
    // Check if host exists and is approved
    const host = await this.prisma.user.findUnique({
      where: { id: hostId },
      include: { kycVerification: true },
    });

    if (!host) {
      throw new NotFoundException('Host not found');
    }

    // Check if host has approved KYC
    if (!host.kycVerification || host.kycVerification.status !== 'APPROVED') {
      throw new ForbiddenException('Host KYC verification is required before listing properties. Please complete your verification first.');
    }

    // Create property
    const property = await this.prisma.property.create({
      data: {
        ...createPropertyDto,
        hostId,
        status: PropertyStatus.PENDING_APPROVAL,
        basePricePerNight: new Decimal(createPropertyDto.basePricePerNight.toString()),
        cleaningFee: createPropertyDto.cleaningFee ? new Decimal(createPropertyDto.cleaningFee.toString()) : null,
        images: createPropertyDto.images || [],
      },
    });

    this.logger.log(`Property created: ${property.title} by host: ${host.email}`);

    // Notify admin
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL') || 'stayconnectng@gmail.com';
    await this.notificationService.notifyNewPropertySubmitted(
      adminEmail,
      property.title,
      `${host.firstName} ${host.lastName}`,
      host.email,
    );

    // Convert Decimal values to numbers for the response
    return {
      ...property,
      basePricePerNight: Number(property.basePricePerNight),
      cleaningFee: property.cleaningFee ? Number(property.cleaningFee) : null,
      commissionPercent: Number(property.commissionPercent),
      averageRating: property.averageRating ?? 0,
    } as unknown as PropertyResponseDto;
  }

  async findAll(query: QueryPropertiesDto): Promise<PaginatedResult<PropertyResponseDto>> {
    const {
      search,
      propertyType,
      status,
      city,
      state,
      minPrice,
      maxPrice,
      guests,
      page,
      limit,
    } = query;

    const { skip, take } = {
      skip: PaginationUtil.calculateSkip({ page, limit }),
      take: limit,
    };

    // Build where clause
    const where: any = {};

    // Only show approved properties for public search
    where.status = status || PropertyStatus.APPROVED;

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (propertyType) {
      where.propertyType = propertyType;
    }

    if (city) {
      where.city = { contains: city, mode: 'insensitive' };
    }

    if (state) {
      where.state = { contains: state, mode: 'insensitive' };
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.basePricePerNight = {};
      if (minPrice !== undefined) {
        where.basePricePerNight.gte = minPrice;
      }
      if (maxPrice !== undefined) {
        where.basePricePerNight.lte = maxPrice;
      }
    }

    if (guests) {
      where.maxGuests = { gte: guests };
    }

    // Get total count
    const total = await this.prisma.property.count({ where });

    // Get properties
    const properties = await this.prisma.property.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        host: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            hostRating: true,
            hostReviewCount: true,
          },
        },
      },
    });

    // Convert Decimal values to numbers for the response
    const convertedProperties = properties.map(property => ({
      ...property,
      basePricePerNight: Number(property.basePricePerNight),
      cleaningFee: property.cleaningFee ? Number(property.cleaningFee) : null,
      commissionPercent: Number(property.commissionPercent),
      averageRating: property.averageRating ?? 0,
      host: {
        ...property.host,
        hostRating: property.host.hostRating ?? 0,
        hostReviewCount: property.host.hostReviewCount ?? 0,
      },
    }));

    return PaginationUtil.createResult(convertedProperties as PropertyResponseDto[], total, { page, limit });
  }

  async findAllAdmin(query: QueryPropertiesDto): Promise<PaginatedResult<PropertyResponseDto>> {
    const { page, limit, status } = query;
    const { skip, take } = {
      skip: PaginationUtil.calculateSkip({ page, limit }),
      take: limit,
    };

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [properties, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          host: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.property.count({ where }),
    ]);

    const convertedProperties = properties.map(property => ({
      ...property,
      basePricePerNight: Number(property.basePricePerNight),
      cleaningFee: property.cleaningFee ? Number(property.cleaningFee) : null,
      commissionPercent: Number(property.commissionPercent),
      averageRating: property.averageRating ?? 0,
      host: {
        ...property.host,
        hostRating: 0,
        hostReviewCount: 0,
      },
    }));

    return PaginationUtil.createResult(convertedProperties as PropertyResponseDto[], total, { page, limit });
  }

  async findByHost(hostId: string, query: QueryPropertiesDto): Promise<PaginatedResult<PropertyResponseDto>> {
    const { page, limit } = query;
    const { skip, take } = {
      skip: PaginationUtil.calculateSkip({ page, limit }),
      take: limit,
    };

    const [properties, total] = await Promise.all([
      this.prisma.property.findMany({
        where: { hostId },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.property.count({ where: { hostId } }),
    ]);

    // Convert Decimal values to numbers for the response
    const convertedProperties = properties.map(property => ({
      ...property,
      basePricePerNight: Number(property.basePricePerNight),
      cleaningFee: property.cleaningFee ? Number(property.cleaningFee) : null,
      commissionPercent: Number(property.commissionPercent),
      averageRating: property.averageRating ?? 0,
    }));

    return PaginationUtil.createResult(convertedProperties as PropertyResponseDto[], total, { page, limit });
  }

  async findOne(id: string): Promise<PropertyResponseDto> {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        host: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            hostRating: true,
            hostReviewCount: true,
            hostSince: true,
          },
        },
      },
    });

    if (!property) {
      throw new NotFoundException(`Property with ID '${id}' not found`);
    }

    // Convert Decimal values to numbers for the response
    return {
      ...property,
      basePricePerNight: Number(property.basePricePerNight),
      cleaningFee: property.cleaningFee ? Number(property.cleaningFee) : null,
      commissionPercent: Number(property.commissionPercent),
      averageRating: property.averageRating ?? 0,
      host: {
        ...property.host,
        hostRating: property.host.hostRating ?? 0,
        hostReviewCount: property.host.hostReviewCount ?? 0,
        hostSince: property.host.hostSince,
      },
    } as unknown as PropertyResponseDto;
  }

  async update(
    id: string,
    hostId: string,
    hostRole: string,
    updatePropertyDto: UpdatePropertyDto,
  ): Promise<PropertyResponseDto> {
    const property = await this.prisma.property.findUnique({
      where: { id },
    });

    if (!property) {
      throw new NotFoundException(`Property with ID '${id}' not found`);
    }

    // Check permission
    if (property.hostId !== hostId && !hostRole.includes('ADMIN')) {
      throw new ForbiddenException('You do not have permission to update this property');
    }

    // Prevent updates to approved properties (require admin approval)
    if (property.status === PropertyStatus.APPROVED && !hostRole.includes('ADMIN')) {
      updatePropertyDto.status = PropertyStatus.PENDING_APPROVAL;
    }

    const updatedProperty = await this.prisma.property.update({
      where: { id },
      data: updatePropertyDto,
    });

    this.logger.log(`Property updated: ${updatedProperty.title}`);

    // Convert Decimal values to numbers for the response
    return {
      ...updatedProperty,
      basePricePerNight: Number(updatedProperty.basePricePerNight),
      cleaningFee: updatedProperty.cleaningFee ? Number(updatedProperty.cleaningFee) : null,
      commissionPercent: Number(updatedProperty.commissionPercent),
      averageRating: updatedProperty.averageRating ?? 0,
    } as unknown as PropertyResponseDto;
  }

  async remove(id: string, hostId: string, hostRole: string): Promise<void> {
    const property = await this.prisma.property.findUnique({
      where: { id },
    });

    if (!property) {
      throw new NotFoundException(`Property with ID '${id}' not found`);
    }

    // Check permission
    if (property.hostId !== hostId && !hostRole.includes('ADMIN')) {
      throw new ForbiddenException('You do not have permission to delete this property');
    }

    await this.prisma.property.delete({
      where: { id },
    });

    this.logger.log(`Property deleted: ${property.title}`);
  }

  async reviewProperty(
    id: string,
    adminId: string,
    status: PropertyStatus,
    reviewNotes?: string,
    rejectionReason?: string,
  ): Promise<PropertyResponseDto> {
    const property = await this.prisma.property.findUnique({
      where: { id },
    });

    if (!property) {
      throw new NotFoundException(`Property with ID '${id}' not found`);
    }

    const updateData: any = {
      status,
      reviewedBy: adminId,
      reviewedAt: new Date(),
      reviewNotes,
    };

    if (status === PropertyStatus.APPROVED) {
      updateData.publishedAt = new Date();
    }

    if (status === PropertyStatus.REJECTED) {
      updateData.rejectionReason = rejectionReason;
    }

    const updatedProperty = await this.prisma.property.update({
      where: { id },
      data: updateData,
    });

    this.logger.log(`Property ${status}: ${updatedProperty.title}`);

    // Convert Decimal values to numbers for the response
    return {
      ...updatedProperty,
      basePricePerNight: Number(updatedProperty.basePricePerNight),
      cleaningFee: updatedProperty.cleaningFee ? Number(updatedProperty.cleaningFee) : null,
      commissionPercent: Number(updatedProperty.commissionPercent),
      averageRating: updatedProperty.averageRating ?? 0,
    } as unknown as PropertyResponseDto;
  }

  async getPropertyStats(id: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            bookings: true,
          },
        },
        bookings: {
          where: {
            status: {
              in: ['ACCEPTED', 'COMPLETED'],
            },
          },
          select: {
            totalAmount: true,
          },
        },
      },
    });

    if (!property) {
      throw new NotFoundException(`Property with ID '${id}' not found`);
    }

    const totalRevenue = property.bookings.reduce(
      (sum, booking) => sum + Number(booking.totalAmount),
      0,
    );

    return {
      propertyId: id,
      totalBookings: property._count.bookings,
      totalRevenue,
      averageRating: property.averageRating,
      reviewCount: property.reviewCount,
    };
  }
}
