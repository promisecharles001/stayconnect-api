import { ApiProperty } from '@nestjs/swagger';
import { WithdrawalStatus } from '@prisma/client';

export class WithdrawalResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  hostId: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  bankName: string;

  @ApiProperty()
  bankCode: string;

  @ApiProperty()
  accountNumber: string;

  @ApiProperty()
  accountName: string;

  @ApiProperty({ enum: WithdrawalStatus })
  status: WithdrawalStatus;

  @ApiProperty({ nullable: true })
  processedAt: Date | null;

  @ApiProperty({ nullable: true })
  processedBy: string | null;

  @ApiProperty({ nullable: true })
  transferReference: string | null;

  @ApiProperty({ nullable: true })
  transferReceipt: string | null;

  @ApiProperty({ nullable: true })
  failureReason: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
