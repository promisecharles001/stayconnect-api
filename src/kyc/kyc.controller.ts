import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { KycService } from './kyc.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateKycDto } from './dto/create-kyc.dto';
import { ReviewKycDto } from './dto/review-kyc.dto';
import { KycResponseDto } from './dto/kyc-response.dto';
import { KYCStatus } from '@prisma/client';

@ApiTags('KYC Verification')
@Controller('kyc')
@ApiBearerAuth()
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit KYC verification' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'KYC submitted successfully',
    type: KycResponseDto,
  })
  async submitKyc(
    @CurrentUser('id') userId: string,
    @Body() createKycDto: CreateKycDto,
  ): Promise<KycResponseDto> {
    return this.kycService.submitKyc(userId, createKycDto);
  }

  @Get('my-kyc')
  @ApiOperation({ summary: 'Get current user KYC status' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'KYC record found',
    type: KycResponseDto,
  })
  async getMyKyc(@CurrentUser('id') userId: string): Promise<KycResponseDto | null> {
    return this.kycService.findByUserId(userId);
  }

  @Get('stats')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get KYC statistics (Admin only)' })
  async getKycStats() {
    return this.kycService.getKycStats();
  }

  @Get('all')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get all KYC records (Admin only)' })
  async findAll(
    @Query('status') status?: KYCStatus,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.kycService.findAll({
      status,
      page: parseInt(page as any, 10),
      limit: parseInt(limit as any, 10),
    });
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get KYC by ID (Admin only)' })
  @ApiParam({ name: 'id', description: 'KYC ID', type: 'string' })
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<KycResponseDto> {
    return this.kycService.findById(id);
  }

  @Patch(':id/review')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Review KYC submission (Admin only)' })
  @ApiParam({ name: 'id', description: 'KYC ID', type: 'string' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'KYC reviewed successfully',
    type: KycResponseDto,
  })
  async reviewKyc(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
    @Body() reviewKycDto: ReviewKycDto,
  ): Promise<KycResponseDto> {
    return this.kycService.reviewKyc(id, adminId, reviewKycDto);
  }

}
