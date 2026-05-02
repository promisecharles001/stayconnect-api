import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsBoolean, IsUrl } from 'class-validator';
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
