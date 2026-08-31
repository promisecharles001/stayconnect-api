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
import { EscrowStatus, Role } from '@prisma/client';
import { BookingsService } from './bookings.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto, VerifyPaymentDto, RefundBookingDto } from './dto/update-booking.dto';
import { SubmitPaymentProofDto } from './dto/submit-payment-proof.dto';
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
    @CurrentUser('id') visitorId: string,
    @Body() createBookingDto: CreateBookingDto,
  ): Promise<BookingResponseDto> {
    return this.bookingsService.create(visitorId, createBookingDto);
  }

  @Get('my-bookings')
  @ApiOperation({ summary: 'Get my bookings as visitor' })
  @ApiPaginatedResponse(BookingResponseDto)
  async findMyBookings(
    @CurrentUser('id') visitorId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.bookingsService.findByGuest(visitorId, {
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

  @Get('admin/all')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get bookings needing payment/escrow action (Admin only)' })
  @ApiPaginatedResponse(BookingResponseDto)
  async findAllAdmin(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('escrowStatus') escrowStatus?: EscrowStatus,
    @Query('search') search?: string,
  ) {
    return this.bookingsService.findAllAdmin({
      page: parseInt(page as any, 10),
      limit: parseInt(limit as any, 10),
      escrowStatus,
      search,
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

  @Patch(':id/payment-proof')
  @ApiOperation({ summary: 'Submit proof of payment for a booking (Visitor only)' })
  @ApiParam({ name: 'id', description: 'Booking ID', type: 'string' })
  async submitPaymentProof(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') visitorId: string,
    @Body() dto: SubmitPaymentProofDto,
  ): Promise<BookingResponseDto> {
    return this.bookingsService.submitPaymentProof(id, visitorId, dto.paymentProof);
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

  @Patch(':id/release-funds')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Release held payment to the host after visitor confirms the apartment (Admin only)' })
  @ApiParam({ name: 'id', description: 'Booking ID', type: 'string' })
  async releaseFunds(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
  ): Promise<BookingResponseDto> {
    return this.bookingsService.releaseFunds(id, adminId);
  }

  @Patch(':id/refund')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Refund the visitor (minus a fee) after they reject the apartment on inspection (Admin only)' })
  @ApiParam({ name: 'id', description: 'Booking ID', type: 'string' })
  async refundBooking(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
    @Body() refundDto: RefundBookingDto,
  ): Promise<BookingResponseDto> {
    return this.bookingsService.refundBooking(id, adminId, refundDto);
  }

  @Get('stats/overview')
  @ApiOperation({ summary: 'Get booking statistics' })
  async getBookingStats(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
  ) {
    return this.bookingsService.getBookingStats(userId, userRole.name.includes('HOST'));
  }
}
