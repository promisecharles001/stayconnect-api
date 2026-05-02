import { ApiProperty } from '@nestjs/swagger';

export class TokenResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'LiveKit access token for voice calling',
  })
  token: string;

  @ApiProperty({
    example: 'booking-call-12345',
    description: 'Room name for the voice call',
  })
  roomName: string;

  @ApiProperty({
    example: 'wss://your-livekit-server.com',
    description: 'LiveKit server URL',
  })
  serverUrl: string;

  @ApiProperty({
    example: 3600,
    description: 'Token expiration time in seconds',
  })
  expiresIn: number;
}
