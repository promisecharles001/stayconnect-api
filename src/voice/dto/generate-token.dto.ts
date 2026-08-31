import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, ValidateIf, IsNotEmpty } from 'class-validator';

export class GenerateTokenDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    required: false,
    description:
      'Booking ID. Caller must be the visitor or host of this booking. ' +
      'Provide this OR propertyId.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Booking ID cannot be empty' })
  bookingId?: string;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    required: false,
    description:
      'Property ID, for calling a host about a listing before any booking ' +
      'exists. Provide this OR bookingId.',
  })
  @ValidateIf((o) => !o.bookingId)
  @IsString()
  @IsNotEmpty({ message: 'Provide either a bookingId or a propertyId' })
  propertyId?: string;

  @ApiProperty({
    example: 'user-john-doe',
    description: 'Participant display name shown in the call',
    required: false,
  })
  @IsString()
  @IsOptional()
  participantName?: string;
}
