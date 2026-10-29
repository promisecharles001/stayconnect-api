import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SignalCallDto {
  @ApiProperty({
    example: 'booking-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'The room name from the incoming-call event or generate-token response.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  roomName: string;

  @ApiProperty({ required: false, description: 'Booking the call is about, if it was a booking call.' })
  @IsOptional()
  @IsString()
  bookingId?: string;

  @ApiProperty({ required: false, description: 'Property the call is about, if it was a property call.' })
  @IsOptional()
  @IsString()
  propertyId?: string;

  @ApiProperty({
    enum: ['declined', 'cancelled'],
    description:
      '"declined": the person being called turned it down. "cancelled": the caller gave up before it was answered.',
  })
  @IsIn(['declined', 'cancelled'])
  action: 'declined' | 'cancelled';
}
