import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class GenerateTokenDto {
  @ApiProperty({
    example: 'booking-call-12345',
    description: 'Unique room name for the voice call',
  })
  @IsString()
  @IsNotEmpty({ message: 'Room name is required' })
  roomName: string;

  @ApiProperty({
    example: 'user-john-doe',
    description: 'Participant name/identity for the LiveKit session',
  })
  @IsString()
  @IsOptional()
  participantName?: string;
}
