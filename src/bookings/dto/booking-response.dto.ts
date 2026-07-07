import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';

export class BookingResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  visitorId: string;

  @ApiProperty()
  hostId: string;

  @ApiProperty()
  propertyId: string;

  @ApiProperty()
  startDate: Date;

  @ApiProperty()
  endDate: Date;

  @ApiProperty()
  totalAmount: number;

  @ApiProperty()
  commissionAmount: number;

  @ApiProperty({ enum: BookingStatus })
  status: BookingStatus;

  @ApiProperty({ nullable: true })
  paymentProof: string | null;

  @ApiProperty()
  paymentVerified: boolean;

  @ApiProperty({ nullable: true })
  verifiedAt: Date | null;

  @ApiProperty({ nullable: true })
  verifiedBy: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: 'object', nullable: true })
  property?: {
    id: string;
    title: string;
    images: string[];
  };

  @ApiProperty({ type: 'object', nullable: true })
  host?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };

  @ApiProperty({ type: 'object', nullable: true })
  visitor?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
}
