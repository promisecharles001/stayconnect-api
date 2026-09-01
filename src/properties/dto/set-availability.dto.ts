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
  // Read `obj`, the original plain body, rather than `value`: by the time a
  // transform sees `value`, implicit conversion has already turned "false"
  // into true and the damage is done. Anything that isn't a real boolean or
  // the exact string "true"/"false" becomes undefined so @IsBoolean rejects
  // it instead of guessing.
  @Transform(({ obj }) => {
    const raw = obj?.isAvailable;
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'isAvailable must be true or false' })
  isAvailable: boolean;
}
