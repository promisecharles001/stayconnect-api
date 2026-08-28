import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  WishlistItemDto,
  AddToWishlistResponseDto,
  RemoveFromWishlistResponseDto,
} from './dto/wishlist-response.dto';

@Injectable()
export class WishlistService {
  private readonly logger = new Logger(WishlistService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string): Promise<WishlistItemDto[]> {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            images: true,
            city: true,
            state: true,
            basePricePerNight: true,
            averageRating: true,
          },
        },
      },
    });

    return items.map((item) => ({
      id: item.id,
      propertyId: item.propertyId,
      propertyTitle: item.property.title,
      propertyImage: item.property.images[0] ?? '',
      location: [item.property.city, item.property.state].filter(Boolean).join(', '),
      pricePerNight: Number(item.property.basePricePerNight),
      rating: item.property.averageRating === null ? null : Number(item.property.averageRating),
      createdAt: item.createdAt,
    }));
  }

  async add(userId: string, propertyId: string): Promise<AddToWishlistResponseDto> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });

    if (!property) {
      throw new NotFoundException(`Property with ID '${propertyId}' not found`);
    }

    // Saving an already-saved property is a no-op rather than an error —
    // the heart button can be tapped twice, or two devices can race.
    const item = await this.prisma.wishlistItem.upsert({
      where: { userId_propertyId: { userId, propertyId } },
      create: { userId, propertyId },
      update: {},
    });

    return {
      id: item.id,
      propertyId: item.propertyId,
      userId: item.userId,
      createdAt: item.createdAt,
    };
  }

  async remove(userId: string, propertyId: string): Promise<RemoveFromWishlistResponseDto> {
    // deleteMany rather than delete: removing something already gone should
    // leave the client in the state it asked for, not throw.
    const { count } = await this.prisma.wishlistItem.deleteMany({
      where: { userId, propertyId },
    });

    return {
      success: true,
      message: count > 0 ? 'Removed from wishlist' : 'Property was not in your wishlist',
    };
  }
}
