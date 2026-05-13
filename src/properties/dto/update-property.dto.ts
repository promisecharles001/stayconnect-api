import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  IsArray,
  IsDecimal,
} from 'class-validator';
import { PropertyType, PropertyStatus } from '@prisma/client';

export class UpdatePropertyDto {
  @ApiProperty({ example: 'Luxury Apartment in Lekki', required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ example: 'Beautiful luxury apartment...', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: PropertyType, example: PropertyType.APARTMENT, required: false })
  @IsOptional()
  @IsEnum(PropertyType)
  propertyType?: PropertyType;

  @ApiProperty({ example: '123 Admiralty Way', required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: 'Lekki', required: false })
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

  @ApiProperty({ example: 4, minimum: 1, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxGuests?: number;

  @ApiProperty({ example: 2, minimum: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  bedrooms?: number;

  @ApiProperty({ example: 3, minimum: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  beds?: number;

  @ApiProperty({ example: 2.5, minimum: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  bathrooms?: number;

  @ApiProperty({ example: ['WiFi', 'Pool'], required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @ApiProperty({
    example: ['data:image/jpeg;base64,/9j/4AAQ...'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiProperty({ example: 'No smoking', required: false })
  @IsOptional()
  @IsString()
  houseRules?: string;

  @ApiProperty({ example: 50000.00, required: false })
  @IsOptional()
  @IsDecimal()
  basePricePerNight?: number;

  @ApiProperty({ example: 5000.00, required: false })
  @IsOptional()
  @IsDecimal()
  cleaningFee?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  isInstantBook?: boolean;

  @ApiProperty({ example: 1, minimum: 1, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  minNights?: number;

  @ApiProperty({ example: 30, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxNights?: number;

  @ApiProperty({ enum: PropertyStatus, example: PropertyStatus.DRAFT, required: false })
  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;
}
