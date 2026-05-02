import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsNotEmpty, Min } from 'class-validator';

export class CreateWithdrawalDto {
  @ApiProperty({ example: 50000.00, description: 'Amount to withdraw' })
  @IsNumber()
  @Min(1000, { message: 'Minimum withdrawal amount is 1000 NGN' })
  amount: number;

  @ApiProperty({ example: 'Guaranty Trust Bank' })
  @IsString()
  @IsNotEmpty()
  bankName: string;

  @ApiProperty({ example: '058' })
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @ApiProperty({ example: '0123456789' })
  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  accountName: string;
}
