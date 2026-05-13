import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsOptional,
  IsPhoneNumber,
  IsEnum,
} from 'class-validator';
import { UserStatus } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({ example: 'SecurePass123!', description: 'User password' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(50, { message: 'Password cannot exceed 50 characters' })
  password: string;

  @ApiProperty({ example: 'John', description: 'First name' })
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @MinLength(2, { message: 'First name must be at least 2 characters' })
  @MaxLength(50, { message: 'First name cannot exceed 50 characters' })
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  @MinLength(2, { message: 'Last name must be at least 2 characters' })
  @MaxLength(50, { message: 'Last name cannot exceed 50 characters' })
  lastName: string;

  @ApiProperty({ example: '+2348012345678', description: 'Phone number', required: false })
  @IsOptional()
  @IsPhoneNumber('NG', { message: 'Please provide a valid Nigerian phone number' })
  phone?: string;

  @ApiProperty({ 
    example: 'ACTIVE', 
    description: 'User status', 
    enum: UserStatus,
    required: false 
  })
  @IsOptional()
  @IsEnum(UserStatus, { message: 'Invalid user status' })
  status?: UserStatus;

  @ApiProperty({ 
    example: 'GUEST', 
    description: 'User role', 
    enum: ['ADMIN', 'HOST', 'GUEST'],
    required: false 
  })
  @IsOptional()
  @IsEnum(['ADMIN', 'HOST', 'GUEST'], { message: 'Invalid user role. Must be ADMIN, HOST, or GUEST' })
  role?: 'ADMIN' | 'HOST' | 'GUEST';
}
