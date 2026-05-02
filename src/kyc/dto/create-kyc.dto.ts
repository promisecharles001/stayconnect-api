import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsDateString,
} from 'class-validator';
import { KYCDocumentType } from '@prisma/client';

export class CreateKycDto {
  @ApiProperty({ enum: KYCDocumentType, example: KYCDocumentType.NIN_SLIP })
  @IsEnum(KYCDocumentType, { message: 'Invalid document type' })
  @IsNotEmpty({ message: 'Document type is required' })
  documentType: KYCDocumentType;

  @ApiProperty({ example: '12345678901' })
  @IsString()
  @IsNotEmpty({ message: 'Document number is required' })
  documentNumber: string;

  @ApiProperty({ example: 'https://example.com/document-front.jpg' })
  @IsString()
  @IsNotEmpty({ message: 'Document front image is required' })
  documentImageFront: string;

  @ApiProperty({ example: 'https://example.com/document-back.jpg', required: false })
  @IsOptional()
  @IsString()
  documentImageBack?: string;

  @ApiProperty({ example: '1990-01-01', required: false })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiProperty({ example: '123 Main Street', required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: 'Lagos', required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ example: 'Lagos State', required: false })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiProperty({ example: 'Nigeria', required: false })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ example: 'https://example.com/selfie.jpg', required: false })
  @IsOptional()
  @IsString()
  selfieImage?: string;
}
