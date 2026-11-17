import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID,
  IsNotEmpty,
  IsDateString,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @IsNotEmpty()
  propertyId: string;

  @ApiProperty({ example: '2024-03-01' })
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({ example: '2024-03-05' })
  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  // Accepted only so app versions that still send it aren't rejected by the
  // whitelist validator. The server IGNORES it and prices the stay itself —
  // trusting it let a visitor book any property for ₦1.
  @ApiProperty({
    example: 300000.0,
    required: false,
    deprecated: true,
    description: 'Ignored. The server computes the total from the nightly price and dates.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalAmount?: number;
}
