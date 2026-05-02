import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConversationDto {
  @ApiProperty({ description: 'Property ID' })
  @IsString()
  @IsNotEmpty()
  propertyId: string;

  @ApiProperty({ description: 'Host user ID' })
  @IsString()
  @IsNotEmpty()
  hostId: string;

  @ApiPropertyOptional({ description: 'Initial message to start the conversation' })
  @IsString()
  @IsOptional()
  initialMessage?: string;
}
