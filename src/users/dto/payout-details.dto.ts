import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Matches, MaxLength } from 'class-validator';

export class UpdatePayoutDetailsDto {
  @ApiProperty({ example: 'Guaranty Trust Bank' })
  @IsString()
  @IsNotEmpty({ message: 'Bank name is required' })
  @MaxLength(100)
  bankName: string;

  @ApiProperty({ example: '058', description: 'NIBSS bank code' })
  @IsString()
  @IsNotEmpty({ message: 'Bank code is required' })
  @Matches(/^\d{3,6}$/, { message: 'Bank code must be 3-6 digits' })
  bankCode: string;

  @ApiProperty({ example: '0123456789', description: '10-digit NUBAN' })
  @IsString()
  @IsNotEmpty({ message: 'Account number is required' })
  @Matches(/^\d{10}$/, { message: 'Account number must be exactly 10 digits' })
  accountNumber: string;

  @ApiProperty({ example: 'Ada Okeke' })
  @IsString()
  @IsNotEmpty({ message: 'Account name is required' })
  @MaxLength(100)
  accountName: string;

  @ApiProperty({
    example: 'your-current-password',
    description:
      'The account password. Required to change where money is sent — a ' +
      'hijacked session should not be able to redirect payouts silently.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Your password is required to change payout details' })
  password: string;
}

export class PayoutDetailsResponseDto {
  @ApiProperty({ nullable: true })
  bankName: string | null;

  @ApiProperty({ nullable: true })
  bankCode: string | null;

  @ApiProperty({ nullable: true })
  accountNumber: string | null;

  @ApiProperty({ nullable: true })
  accountName: string | null;

  @ApiProperty({ nullable: true })
  updatedAt: Date | null;
}
