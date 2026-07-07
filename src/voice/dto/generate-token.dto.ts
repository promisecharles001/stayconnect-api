import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class GenerateTokenDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Booking ID — caller must be the visitor or host of this booking, and payment must be verified',
  })
  @IsString()
  @IsNotEmpty({ message: 'Booking ID is required' })
  bookingId: string;

  @ApiProperty({
    example: 'user-john-doe',
    description: 'Participant display name shown in the call',
  })
  @IsString()
  @IsOptional()
  participantName?: string;
}
