import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto, VerifyPaymentDto } from './dto/update-booking.dto';
import { BookingResponseDto } from './dto/booking-response.dto';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';

@ApiTags('Bookings')
@Controller('bookings')
@ApiBearerAuth()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new booking' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Booking created successfully',
    type: BookingResponseDto,
  })
  async create(
    @CurrentUser('id') guestId: string,
    @Body() createBookingDto: CreateBookingDto,
  ): Promise<BookingResponseDto> {
    return this.bookingsService.create(guestId, createBookingDto);
  }

  @Get('my-bookings')
  @ApiOperation({ summary: 'Get my bookings as guest' })
  @ApiPaginatedResponse(BookingResponseDto)
  async findMyBookings(
    @CurrentUser('id') guestId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.bookingsService.findByGuest(guestId, {
      page: parseInt(page as any, 10),
      limit: parseInt(limit as any, 10),
    });
  }

  @Get('host-bookings')
  @ApiOperation({ summary: 'Get bookings for my properties (Host only)' })
  @ApiPaginatedResponse(BookingResponseDto)
  async findHostBookings(
    @CurrentUser('id') hostId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.bookingsService.findByHost(hostId, {
      page: parseInt(page as any, 10),
      limit: parseInt(limit as any, 10),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get booking by ID' })
  @ApiParam({ name: 'id', description: 'Booking ID', type: 'string' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<BookingResponseDto> {
    return this.bookingsService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update booking status (Host only)' })
  @ApiParam({ name: 'id', description: 'Booking ID', type: 'string' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() updateBookingDto: UpdateBookingDto,
  ): Promise<BookingResponseDto> {
    return this.bookingsService.updateStatus(id, userId, updateBookingDto);
  }

  @Patch(':id/verify-payment')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Verify booking payment (Admin only)' })
  @ApiParam({ name: 'id', description: 'Booking ID', type: 'string' })
  async verifyPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
    @Body() verifyDto: VerifyPaymentDto,
  ): Promise<BookingResponseDto> {
    return this.bookingsService.verifyPayment(id, adminId, verifyDto);
  }

  @Get('stats/overview')
  @ApiOperation({ summary: 'Get booking statistics' })
  async getBookingStats(
    @CurrentUser('id') userId: string,
    @CurrentUser('roleId') userRoleId: string,
  ) {
    return this.bookingsService.getBookingStats(userId, userRoleId.includes('HOST'));
  }
}
