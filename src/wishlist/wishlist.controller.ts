import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { WishlistService } from './wishlist.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  WishlistResponseDto,
  AddToWishlistResponseDto,
  RemoveFromWishlistResponseDto,
} from './dto/wishlist-response.dto';

@ApiTags('Wishlist')
@Controller('wishlist')
@ApiBearerAuth()
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  @ApiOperation({ summary: "Get the current user's saved properties" })
  @ApiResponse({ status: HttpStatus.OK, type: WishlistResponseDto })
  async findAll(@CurrentUser('id') userId: string): Promise<WishlistResponseDto> {
    return { items: await this.wishlistService.findAll(userId) };
  }

  @Post(':propertyId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save a property to the wishlist' })
  @ApiParam({ name: 'propertyId', description: 'Property ID', type: 'string' })
  @ApiResponse({ status: HttpStatus.CREATED, type: AddToWishlistResponseDto })
  async add(
    @CurrentUser('id') userId: string,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
  ): Promise<AddToWishlistResponseDto> {
    return this.wishlistService.add(userId, propertyId);
  }

  @Delete(':propertyId')
  @ApiOperation({ summary: 'Remove a property from the wishlist' })
  @ApiParam({ name: 'propertyId', description: 'Property ID', type: 'string' })
  @ApiResponse({ status: HttpStatus.OK, type: RemoveFromWishlistResponseDto })
  async remove(
    @CurrentUser('id') userId: string,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
  ): Promise<RemoveFromWishlistResponseDto> {
    return this.wishlistService.remove(userId, propertyId);
  }
}
