import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetAvailabilityDto {
  @ApiProperty({
    example: false,
    description: 'false takes the listing off the market; true puts it back.',
  })
  @IsBoolean({ message: 'isAvailable must be true or false' })
  isAvailable: boolean;
}
