import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Admin')
@Controller('admin')
@ApiBearerAuth()
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get admin dashboard statistics' })
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('users/stats')
  @ApiOperation({ summary: 'Get user statistics' })
  async getUserStats() {
    return this.adminService.getUserStats();
  }

  @Get('properties/stats')
  @ApiOperation({ summary: 'Get property statistics' })
  async getPropertyStats() {
    return this.adminService.getPropertyStats();
  }

  @Get('bookings/stats')
  @ApiOperation({ summary: 'Get booking statistics' })
  async getBookingStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getBookingStats(startDate, endDate);
  }

  @Get('revenue/stats')
  @ApiOperation({ summary: 'Get revenue statistics' })
  async getRevenueStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getRevenueStats(startDate, endDate);
  }

  @Get('activities')
  @ApiOperation({ summary: 'Get recent admin activities' })
  async getRecentActivities(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.adminService.getRecentActivities(
      parseInt(page as any, 10),
      parseInt(limit as any, 10),
    );
  }
}
