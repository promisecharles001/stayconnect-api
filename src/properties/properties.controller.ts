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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { PropertiesService } from './properties.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { QueryPropertiesDto } from './dto/query-properties.dto';
import { PropertyResponseDto } from './dto/property-response.dto';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';
import { PropertyStatus } from '@prisma/client';

@ApiTags('Properties')
@Controller('properties')
@ApiBearerAuth()
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new property (Host only)' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Property created successfully',
    type: PropertyResponseDto,
  })
  async create(
    @CurrentUser('id') hostId: string,
    @Body() createPropertyDto: CreatePropertyDto,
  ): Promise<PropertyResponseDto> {
    return this.propertiesService.create(hostId, createPropertyDto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all properties with filters' })
  @ApiPaginatedResponse(PropertyResponseDto)
  async findAll(@Query() query: QueryPropertiesDto) {
    return this.propertiesService.findAll(query);
  }

  @Get('admin/all')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get all properties for admin review' })
  @ApiPaginatedResponse(PropertyResponseDto)
  async findAllAdmin(@Query() query: QueryPropertiesDto) {
    return this.propertiesService.findAllAdmin(query);
  }

  @Get('my-properties')
  @ApiOperation({ summary: 'Get current host properties' })
  @ApiPaginatedResponse(PropertyResponseDto)
  async findMyProperties(
    @CurrentUser('id') hostId: string,
    @Query() query: QueryPropertiesDto,
  ) {
    return this.propertiesService.findByHost(hostId, query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get property by ID' })
  @ApiParam({ name: 'id', description: 'Property ID', type: 'string' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Property found',
    type: PropertyResponseDto,
  })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<PropertyResponseDto> {
    return this.propertiesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update property' })
  @ApiParam({ name: 'id', description: 'Property ID', type: 'string' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Property updated successfully',
    type: PropertyResponseDto,
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') hostId: string,
    @CurrentUser('roleId') userRoleId: string,
    @Body() updatePropertyDto: UpdatePropertyDto,
  ): Promise<PropertyResponseDto> {
    return this.propertiesService.update(id, hostId, userRoleId, updatePropertyDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete property' })
  @ApiParam({ name: 'id', description: 'Property ID', type: 'string' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') hostId: string,
    @CurrentUser('roleId') userRoleId: string,
  ): Promise<void> {
    return this.propertiesService.remove(id, hostId, userRoleId);
  }

  @Patch(':id/review')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Review property (Admin only)' })
  @ApiParam({ name: 'id', description: 'Property ID', type: 'string' })
  async reviewProperty(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
    @Body('status') status: PropertyStatus,
    @Body('reviewNotes') reviewNotes?: string,
    @Body('rejectionReason') rejectionReason?: string,
  ): Promise<PropertyResponseDto> {
    return this.propertiesService.reviewProperty(id, adminId, status, reviewNotes, rejectionReason);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get property statistics' })
  @ApiParam({ name: 'id', description: 'Property ID', type: 'string' })
  async getPropertyStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.propertiesService.getPropertyStats(id);
  }
}
