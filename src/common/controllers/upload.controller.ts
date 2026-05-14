import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CloudinaryService } from '../services/cloudinary.service';

@ApiTags('Upload')
@Controller('upload')
@ApiBearerAuth()
export class UploadController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Post('images')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload base64 images to Cloudinary' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Images uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  })
  async uploadImages(@Body('images') images: string[]): Promise<{ urls: string[] }> {
    const urls = await this.cloudinaryService.uploadImages(images);
    return { urls };
  }
}
