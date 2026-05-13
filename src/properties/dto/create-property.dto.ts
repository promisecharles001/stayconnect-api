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
} from 'class-validator';
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
