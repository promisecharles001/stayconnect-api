import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EarningsService } from './earnings.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';
import { EarningsLedgerDto, EarningsSummaryDto, BookingEarningDto } from './dto/earnings-response.dto';

@ApiTags('Earnings')
@Controller('earnings')
@ApiBearerAuth()
export class EarningsController {
  constructor(private readonly earningsService: EarningsService) {}

  @Get('ledger')
  @ApiOperation({ summary: 'Get earnings ledger' })
  @ApiPaginatedResponse(EarningsLedgerDto)
  async getEarningsLedger(
    @CurrentUser('id') hostId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.earningsService.getEarningsLedger(hostId, {
      page: parseInt(page as any, 10),
      limit: parseInt(limit as any, 10),
    });
  }

  @Get('bookings')
  @ApiOperation({ summary: 'Get earnings from bookings' })
  @ApiPaginatedResponse(BookingEarningDto)
  async getEarningsBookings(
    @CurrentUser('id') hostId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.earningsService.getEarningsBookings(hostId, {
      page: parseInt(page as any, 10),
      limit: parseInt(limit as any, 10),
    });
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get earnings summary' })
  async getEarningsSummary(@CurrentUser('id') hostId: string): Promise<EarningsSummaryDto> {
    return this.earningsService.getEarningsSummary(hostId);
  }
}
