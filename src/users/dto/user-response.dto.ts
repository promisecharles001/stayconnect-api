import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';

export class RoleDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string | null;
}

export class UserResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'John' })
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  lastName: string;

  @ApiProperty({ example: '+2348012345678', nullable: true })
  phone: string | null;

  @ApiProperty({ example: 'https://example.com/avatar.jpg', nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ type: RoleDto })
  role: RoleDto;

  @ApiProperty({ enum: UserStatus, example: UserStatus.ACTIVE })
  status: UserStatus;

  @ApiProperty({ example: false })
  emailVerified: boolean;

  @ApiProperty({ example: false })
  phoneVerified: boolean;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updatedAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z', nullable: true })
  lastLoginAt: Date | null;

  @ApiProperty({ example: 0 })
  hostRating: number | null;

  @ApiProperty({ example: 0 })
  hostReviewCount: number | null;

  @ApiProperty({ example: 0 })
  guestRating: number | null;

  @ApiProperty({ example: 0 })
  guestReviewCount: number | null;
}
