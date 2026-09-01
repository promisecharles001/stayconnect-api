import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsBoolean, IsUrl, IsNumber, Min } from 'class-validator';
import { BookingStatus } from '@prisma/client';

export class UpdateBookingDto {
  @ApiProperty({ enum: BookingStatus, example: BookingStatus.ACCEPTED, required: false })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiProperty({ example: 'https://example.com/payment-proof.jpg', required: false })
  @IsOptional()
  @IsUrl()
  paymentProof?: string;
}

export class VerifyPaymentDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  verified: boolean;
}

export class RefundBookingDto {
  @ApiProperty({
    required: false,
    deprecated: true,
    description:
      'Ignored. Refunds return the full amount — no fee is retained. Still ' +
      'accepted so app versions that predate this change keep working ' +
      'instead of failing validation on an unknown property.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  feeAmount?: number;

  @ApiProperty({ example: 'Visitor inspected the apartment and it did not match the listing.', required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
