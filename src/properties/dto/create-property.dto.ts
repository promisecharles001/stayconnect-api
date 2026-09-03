import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
  Min,
  IsArray,
  IsUrl,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PropertyType } from '@prisma/client';

export class CreatePropertyDto {
  @ApiProperty({ example: 'Luxury Apartment in Lekki' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Beautiful luxury apartment with ocean view...' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ enum: PropertyType, example: PropertyType.APARTMENT })
  @IsEnum(PropertyType)
  propertyType: PropertyType;

  @ApiProperty({ example: '123 Admiralty Way' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ example: 'Lekki' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: 'Lagos State' })
  @IsString()
  @IsNotEmpty()
  state: string;

  @ApiProperty({ example: 'Nigeria', required: false })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ example: '106104', required: false })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiProperty({ example: 6.5244, required: false })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiProperty({ example: 3.3792, required: false })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiProperty({ example: 4, minimum: 1 })
  @IsNumber()
  @Min(1)
  maxGuests: number;

  @ApiProperty({ example: 2, minimum: 0 })
  @IsNumber()
  @Min(0)
  bedrooms: number;

  @ApiProperty({ example: 3, minimum: 0 })
  @IsNumber()
  @Min(0)
  beds: number;

  @ApiProperty({ example: 2.5, minimum: 0 })
  @IsNumber()
  @Min(0)
  bathrooms: number;

  @ApiProperty({ example: ['WiFi', 'Pool', 'Air Conditioning'], required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @ApiProperty({ 
    example: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'], 
    required: false, 
    type: [String] 
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiProperty({ example: 'No smoking, No pets', required: false })
  @IsOptional()
  @IsString()
  houseRules?: string;

  @ApiProperty({ example: '14:00', required: false })
  @IsOptional()
  @IsString()
  checkInTime?: string;

  @ApiProperty({ example: '11:00', required: false })
  @IsOptional()
  @IsString()
  checkOutTime?: string;

  @ApiProperty({ example: 50000.00 })
  @IsNumber()
  @Min(0)
  basePricePerNight: number;

  @ApiProperty({ example: 5000.00, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cleaningFee?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  // Same trap as SetAvailabilityDto: with enableImplicitConversion the string
  // "false" coerces by truthiness to `true`, and with no @IsBoolean at all
  // nothing was checking the type in the first place — any value whatsoever
  // was accepted and stored. Read the raw body so the check happens before
  // conversion, and reject anything that isn't genuinely a boolean.
  @Transform(({ obj }) => {
    const raw = obj?.isInstantBook;
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    // Absent (or explicitly null) means "don't change this" — @IsOptional
    // skips both. Anything else is handed back untouched so @IsBoolean sees
    // the original garbage and rejects it; returning null here instead would
    // ALSO be skipped by @IsOptional and let the bad value through silently.
    if (raw === undefined || raw === null) return undefined;
    return raw;
  })
  @IsBoolean({ message: 'isInstantBook must be true or false' })
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
}
