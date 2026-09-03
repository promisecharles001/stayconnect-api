import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsOptional, IsEnum } from 'class-validator';
import { PropertyStatus } from '@prisma/client';
import { CreatePropertyDto } from './create-property.dto';

/**
 * Derived from CreatePropertyDto rather than written out again.
 *
 * The hand-written version had drifted badly enough that saving an edit
 * always failed: postalCode, checkInTime and checkOutTime were missing
 * entirely, so forbidNonWhitelisted rejected them outright, and
 * basePricePerNight and cleaningFee used @IsDecimal, which expects a string
 * while the app sends a number. Five errors on a form nobody could submit.
 *
 * PartialType keeps the two in step: a field added to create is accepted
 * here automatically, with the same validation rules.
 */
export class UpdatePropertyDto extends PartialType(CreatePropertyDto) {
  @ApiProperty({
    enum: PropertyStatus,
    required: false,
    description:
      'Admin only. Non-admin callers have this stripped in the service — a ' +
      'host must not be able to approve their own listing.',
  })
  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;
}
