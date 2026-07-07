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
    example: 5000,
    description: 'Inspection/platform fee kept from the total amount before refunding the rest to the visitor.',
  })
  @IsNumber()
  @Min(0)
  feeAmount: number;

  @ApiProperty({ example: 'Visitor inspected the apartment and it did not match the listing.', required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
