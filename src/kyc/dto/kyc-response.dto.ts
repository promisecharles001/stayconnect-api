import { ApiProperty } from '@nestjs/swagger';
import { KYCStatus, KYCDocumentType } from '@prisma/client';

export class KycResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  userId: string;

  @ApiProperty({ enum: KYCDocumentType })
  documentType: KYCDocumentType;

  @ApiProperty({ example: '12345678901' })
  documentNumber: string;

  @ApiProperty({ example: 'https://example.com/document-front.jpg' })
  documentImageFront: string;

  @ApiProperty({ example: 'https://example.com/document-back.jpg', nullable: true })
  documentImageBack: string | null;

  @ApiProperty({ example: '1990-01-01T00:00:00.000Z', nullable: true })
  dateOfBirth: Date | null;

  @ApiProperty({ example: '123 Main Street', nullable: true })
  address: string | null;

  @ApiProperty({ example: 'Lagos', nullable: true })
  city: string | null;

  @ApiProperty({ example: 'Lagos State', nullable: true })
  state: string | null;

  @ApiProperty({ example: 'Nigeria', nullable: true })
  country: string | null;

  @ApiProperty({ enum: KYCStatus })
  status: KYCStatus;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440002', nullable: true })
  reviewedBy: string | null;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z', nullable: true })
  reviewedAt: Date | null;

  @ApiProperty({ example: 'Documents verified successfully', nullable: true })
  reviewNotes: string | null;

  @ApiProperty({ example: 'Document appears to be forged', nullable: true })
  rejectionReason: string | null;

  @ApiProperty({ example: 'https://example.com/selfie.jpg', nullable: true })
  selfieImage: string | null;

  @ApiProperty({ example: false })
  selfieVerified: boolean;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  submittedAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updatedAt: Date;
}
