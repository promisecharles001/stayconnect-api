import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { KYCStatus } from '@prisma/client';

export class ReviewKycDto {
  @ApiProperty({ enum: KYCStatus, example: KYCStatus.APPROVED })
  @IsEnum(KYCStatus, { message: 'Invalid KYC status' })
  @IsNotEmpty({ message: 'Status is required' })
  status: KYCStatus;

  @ApiProperty({ example: 'Documents verified successfully', required: false })
  @IsOptional()
  @IsString()
  reviewNotes?: string;

  @ApiProperty({ example: 'Document appears to be forged', required: false })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
