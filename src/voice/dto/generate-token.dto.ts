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

  @ApiProperty({
    example: 'booking-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    required: false,
    description:
      'Pass this when joining a call someone else already started — the ' +
      'room name delivered in the "is calling" push notification. It marks ' +
      'the request as answering rather than initiating, so a second ' +
      '"is calling" push is not sent back to whoever is already waiting, ' +
      'and it is what lets a host join a property call at all (see ' +
      'VoiceService.generateToken for why). Omit it to start a new call.',
  })
  @IsString()
  @IsOptional()
  roomName?: string;
}
