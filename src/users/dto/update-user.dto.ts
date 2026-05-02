import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsPhoneNumber,
  IsEnum,
} from 'class-validator';
import { UserStatus } from '@prisma/client';

export class UpdateUserDto {
  @ApiProperty({ example: 'John', description: 'First name', required: false })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters' })
  @MaxLength(50, { message: 'First name cannot exceed 50 characters' })
  firstName?: string;

  @ApiProperty({ example: 'Doe', description: 'Last name', required: false })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters' })
  @MaxLength(50, { message: 'Last name cannot exceed 50 characters' })
  lastName?: string;

  @ApiProperty({ example: '+2348012345678', description: 'Phone number', required: false })
  @IsOptional()
  @IsPhoneNumber('NG', { message: 'Please provide a valid Nigerian phone number' })
  phone?: string;

  @ApiProperty({ 
    example: 'GUEST', 
    description: 'User role', 
    required: false 
  })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiProperty({ 
    example: UserStatus.ACTIVE, 
    description: 'User status', 
    enum: UserStatus,
    required: false 
  })
  @IsOptional()
  @IsEnum(UserStatus, { message: 'Invalid user status' })
  status?: UserStatus;

  @ApiProperty({ example: 'https://example.com/avatar.jpg', description: 'Avatar URL', required: false })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
