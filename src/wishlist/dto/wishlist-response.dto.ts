import { ApiProperty } from '@nestjs/swagger';

export class WishlistItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  propertyId: string;

  @ApiProperty()
  propertyTitle: string;

  @ApiProperty()
  propertyImage: string;

  @ApiProperty({ example: 'Lekki, Lagos' })
  location: string;

  @ApiProperty()
  pricePerNight: number;

  @ApiProperty({ nullable: true })
  rating: number | null;

  @ApiProperty()
  createdAt: Date;
}

export class WishlistResponseDto {
  @ApiProperty({ type: [WishlistItemDto] })
  items: WishlistItemDto[];
}

export class AddToWishlistResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  propertyId: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  createdAt: Date;
}

export class RemoveFromWishlistResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;
}
