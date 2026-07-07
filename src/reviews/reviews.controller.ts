import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto, RespondToReviewDto } from './dto/update-review.dto';
import { ReviewResponseDto, ReviewsListResponseDto, PropertyReviewsSummaryDto } from './dto/review-response.dto';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';

@ApiTags('Reviews')
@Controller('reviews')
@ApiBearerAuth()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Leave a review for a completed booking' })
  @ApiResponse({ status: HttpStatus.CREATED, type: ReviewResponseDto })
  async create(
    @CurrentUser('id') visitorId: string,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.create(visitorId, dto);
  }

  @Public()
  @Get('property/:propertyId')
  @ApiOperation({ summary: 'Get all reviews for a property' })
  @ApiPaginatedResponse(ReviewResponseDto)
  async findByProperty(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<ReviewsListResponseDto> {
    return this.reviewsService.findByProperty(propertyId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Public()
  @Get('property/:propertyId/summary')
  @ApiOperation({ summary: 'Get rating summary/distribution for a property' })
  @ApiResponse({ status: HttpStatus.OK, type: PropertyReviewsSummaryDto })
  async getPropertySummary(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
  ): Promise<PropertyReviewsSummaryDto> {
    return this.reviewsService.getPropertySummary(propertyId);
  }

  @Get('eligibility/:bookingId')
  @ApiOperation({ summary: "Check whether the current user can review a given booking" })
  async getEligibility(
    @CurrentUser('id') visitorId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ): Promise<{ eligible: boolean; reason?: string }> {
    return this.reviewsService.getEligibility(visitorId, bookingId);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a single review by ID' })
  @ApiResponse({ status: HttpStatus.OK, type: ReviewResponseDto })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ReviewResponseDto> {
    return this.reviewsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit your own review' })
  @ApiResponse({ status: HttpStatus.OK, type: ReviewResponseDto })
  async update(
    @CurrentUser('id') visitorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReviewDto,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.update(visitorId, id, dto);
  }

  @Patch(':id/respond')
  @ApiOperation({ summary: "Host responds to a review on their property" })
  @ApiResponse({ status: HttpStatus.OK, type: ReviewResponseDto })
  async respond(
    @CurrentUser('id') hostId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondToReviewDto,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.respond(hostId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete your own review (or any review, as admin)' })
  async remove(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: { name: string },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.reviewsService.remove(userId, role.name === 'ADMIN', id);
  }
}
