import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsInt, Min, Max, IsOptional, MaxLength } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ example: 'uuid-of-completed-booking', description: 'The completed booking this review is for' })
  @IsString()
  @IsNotEmpty({ message: 'bookingId is required' })
  bookingId: string;

  @ApiProperty({ example: 5, description: 'Rating from 1 to 5', minimum: 1, maximum: 5 })
  @IsInt({ message: 'Rating must be a whole number' })
  @Min(1, { message: 'Rating must be at least 1' })
  @Max(5, { message: 'Rating cannot exceed 5' })
  rating: number;

  @ApiProperty({ example: 'Great stay, very clean and the host was responsive.', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Comment cannot exceed 2000 characters' })
  comment?: string;
}
