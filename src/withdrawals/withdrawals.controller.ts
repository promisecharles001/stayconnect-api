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
import { WithdrawalsService } from './withdrawals.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { WithdrawalResponseDto } from './dto/withdrawal-response.dto';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';
import { WithdrawalStatus } from '@prisma/client';

@ApiTags('Withdrawals')
@Controller('withdrawals')
@ApiBearerAuth()
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create withdrawal request' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Withdrawal request created successfully',
    type: WithdrawalResponseDto,
  })
  async create(
    @CurrentUser('id') hostId: string,
    @Body() createWithdrawalDto: CreateWithdrawalDto,
  ): Promise<WithdrawalResponseDto> {
    return this.withdrawalsService.create(hostId, createWithdrawalDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get my withdrawal requests (alias for /my-withdrawals)' })
  @ApiPaginatedResponse(WithdrawalResponseDto)
  async findMyWithdrawalsRoot(
    @CurrentUser('id') hostId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.withdrawalsService.findByHost(hostId, {
      page: parseInt(page as any, 10),
      limit: parseInt(limit as any, 10),
    });
  }

  @Get('my-withdrawals')
  @ApiOperation({ summary: 'Get my withdrawal requests' })
  @ApiPaginatedResponse(WithdrawalResponseDto)
  async findMyWithdrawals(
    @CurrentUser('id') hostId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.withdrawalsService.findByHost(hostId, {
      page: parseInt(page as any, 10),
      limit: parseInt(limit as any, 10),
    });
  }

  @Get('all')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get all withdrawal requests (Admin only)' })
  @ApiPaginatedResponse(WithdrawalResponseDto)
  async findAll(
    @Query('status') status?: WithdrawalStatus,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.withdrawalsService.findAll({
      status,
      page: parseInt(page as any, 10),
      limit: parseInt(limit as any, 10),
    });
  }

  @Get('stats')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get withdrawal statistics (Admin only)' })
  async getWithdrawalStats() {
    return this.withdrawalsService.getWithdrawalStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get withdrawal by ID' })
  @ApiParam({ name: 'id', description: 'Withdrawal ID', type: 'string' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<WithdrawalResponseDto> {
    return this.withdrawalsService.findOne(id);
  }

  @Patch(':id/process')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Process withdrawal request (Admin only)' })
  @ApiParam({ name: 'id', description: 'Withdrawal ID', type: 'string' })
  async processWithdrawal(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
    @Body('status') status: WithdrawalStatus,
    @Body('transferReference') transferReference?: string,
    @Body('failureReason') failureReason?: string,
  ): Promise<WithdrawalResponseDto> {
    return this.withdrawalsService.processWithdrawal(
      id,
      adminId,
      status,
      transferReference,
      failureReason,
    );
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel withdrawal request' })
  @ApiParam({ name: 'id', description: 'Withdrawal ID', type: 'string' })
  async cancelWithdrawal(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') hostId: string,
  ): Promise<WithdrawalResponseDto> {
    return this.withdrawalsService.cancelWithdrawal(hostId, id);
  }
}
