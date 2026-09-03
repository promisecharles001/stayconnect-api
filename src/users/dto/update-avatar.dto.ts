import { ApiProperty } from '@nestjs/swagger';
import { IsUrl, ValidateIf, IsNotEmpty } from 'class-validator';

export class UpdateAvatarDto {
  @ApiProperty({
    example: 'https://res.cloudinary.com/.../avatar.jpg',
    nullable: true,
    description:
      'A URL returned by POST /upload/images with folder "avatars", or null to remove the current picture.',
  })
  // null is the documented way to clear a picture, so it has to skip the URL
  // check rather than fail it — @IsUrl on its own rejects null and left the
  // "Remove Photo" action with no request it could send. Everything that is
  // not null still has to be a real URL.
  @ValidateIf((_, value) => value !== null)
  @IsNotEmpty({ message: 'An image is required' })
  @IsUrl({}, { message: 'avatarUrl must be a URL' })
  avatarUrl: string | null;
}
