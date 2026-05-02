import { ApiProperty } from '@nestjs/swagger';
import { PropertyType, PropertyStatus } from '@prisma/client';

export class PropertyResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  hostId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ enum: PropertyType })
  propertyType: PropertyType;

  @ApiProperty()
  address: string;

  @ApiProperty()
  city: string;

  @ApiProperty()
  state: string;

  @ApiProperty()
  country: string;

  @ApiProperty({ nullable: true })
  postalCode: string | null;

  @ApiProperty({ nullable: true })
  latitude: number | null;

  @ApiProperty({ nullable: true })
  longitude: number | null;

  @ApiProperty()
  maxGuests: number;

  @ApiProperty()
  bedrooms: number;

  @ApiProperty()
  beds: number;

  @ApiProperty()
  bathrooms: number;

  @ApiProperty({ type: [String] })
  amenities: string[];

  @ApiProperty({ type: [String] })
  images: string[];

  @ApiProperty({ nullable: true })
  houseRules: string | null;

  @ApiProperty()
  checkInTime: string;

  @ApiProperty()
  checkOutTime: string;

  @ApiProperty()
  basePricePerNight: number;

  @ApiProperty({ nullable: true })
  cleaningFee: number | null;

  @ApiProperty()
  commissionPercent: number;

  @ApiProperty({ enum: PropertyStatus })
  status: PropertyStatus;

  @ApiProperty()
  averageRating: number;

  @ApiProperty()
  reviewCount: number;

  @ApiProperty()
  isInstantBook: boolean;

  @ApiProperty()
  minNights: number;

  @ApiProperty({ nullable: true })
  maxNights: number | null;

  @ApiProperty({ nullable: true })
  reviewedBy: string | null;

  @ApiProperty({ nullable: true })
  reviewedAt: Date | null;

  @ApiProperty({ nullable: true })
  reviewNotes: string | null;

  @ApiProperty({ nullable: true })
  rejectionReason: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ nullable: true })
  publishedAt: Date | null;
}
