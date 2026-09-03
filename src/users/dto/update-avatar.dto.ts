import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsUrl } from 'class-validator';

export class UpdateAvatarDto {
  @ApiProperty({
    example: 'https://res.cloudinary.com/.../avatar.jpg',
    description: 'A URL returned by POST /upload/images with folder "avatars".',
  })
  @IsString()
  @IsNotEmpty({ message: 'An image is required' })
  @IsUrl({}, { message: 'avatarUrl must be a URL' })
  avatarUrl: string;
}
