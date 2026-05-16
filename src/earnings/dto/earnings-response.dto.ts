import { ApiProperty } from '@nestjs/swagger';

export class BookingEarningDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  propertyTitle: string;

  @ApiProperty()
  guestName: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  platformFee: number;

  @ApiProperty()
  hostAmount: number;

  @ApiProperty()
  status: string;

  @ApiProperty()
  createdAt: Date;
}

export class EarningsLedgerDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  hostId: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  type: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ nullable: true })
  bookingId: string | null;

  @ApiProperty()
  balanceBefore: number;

  @ApiProperty()
  balanceAfter: number;

  @ApiProperty({ nullable: true })
  withdrawalId: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class EarningsSummaryDto {
  @ApiProperty()
  totalEarnings: number;

  @ApiProperty()
  availableBalance: number;

  @ApiProperty()
  pendingBalance: number;

  @ApiProperty()
  totalWithdrawn: number;

  @ApiProperty()
  thisMonthEarnings: number;

  @ApiProperty()
  lastMonthEarnings: number;
}
