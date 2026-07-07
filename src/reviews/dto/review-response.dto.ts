import { ApiProperty } from '@nestjs/swagger';

export class ReviewResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  bookingId: string;

  @ApiProperty()
  propertyId: string;

  @ApiProperty()
  visitorId: string;

  @ApiProperty()
  visitorName: string;

  @ApiProperty({ required: false })
  visitorAvatarUrl?: string | null;

  @ApiProperty()
  hostId: string;

  @ApiProperty()
  rating: number;

  @ApiProperty({ required: false })
  comment?: string | null;

  @ApiProperty({ required: false })
  hostResponse?: string | null;

  @ApiProperty({ required: false })
  hostRespondedAt?: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ReviewsListResponseDto {
  @ApiProperty({ type: [ReviewResponseDto] })
  data: ReviewResponseDto[];

  @ApiProperty()
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export class PropertyReviewsSummaryDto {
  @ApiProperty()
  averageRating: number;

  @ApiProperty()
  totalReviews: number;

  @ApiProperty()
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}
