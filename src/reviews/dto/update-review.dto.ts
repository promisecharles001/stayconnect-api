import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { CreateReviewDto } from './create-review.dto';

// bookingId can't be changed on an existing review — only rating/comment.
export class UpdateReviewDto extends PartialType(CreateReviewDto) {}

export class RespondToReviewDto {
  @ApiProperty({ example: 'Thanks so much for staying with us!' })
  @IsString()
  @IsNotEmpty({ message: 'Response cannot be empty' })
  @MaxLength(1000, { message: 'Response cannot exceed 1000 characters' })
  response: string;
}
