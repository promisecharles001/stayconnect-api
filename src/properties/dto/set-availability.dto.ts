import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class SetAvailabilityDto {
  @ApiProperty({
    example: false,
    description: 'false takes the listing off the market; true puts it back.',
  })
  // The global pipe runs with enableImplicitConversion, which coerces by
  // truthiness — so the string "false" arrives as `true` and @IsBoolean is
  // perfectly happy with it. On a field that decides whether a listing is
  // publicly visible, that silently does the opposite of what was asked.
  //
  // Accept real booleans and the two literal strings; anything else is left
  // as-is so @IsBoolean rejects it rather than guessing.
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: 'isAvailable must be true or false' })
  isAvailable: boolean;
}
