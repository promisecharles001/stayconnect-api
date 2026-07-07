import {
  Controller,
  Post,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CloudinaryService } from '../services/cloudinary.service';

// Folders this endpoint is allowed to upload into. Keep this an allowlist
// (rather than accepting any client-supplied path) so a caller can't write
// into arbitrary Cloudinary folders.
const ALLOWED_FOLDERS: Record<string, string> = {
  properties: 'stayconnect/properties',
  kyc: 'stayconnect/kyc',
};

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
  async uploadImages(
    @Body('images') images: string[],
    @Body('folder') folder?: string,
  ): Promise<{ urls: string[] }> {
    const targetFolder = folder ? ALLOWED_FOLDERS[folder] : ALLOWED_FOLDERS.properties;

    if (!targetFolder) {
      throw new BadRequestException(
        `Invalid folder. Must be one of: ${Object.keys(ALLOWED_FOLDERS).join(', ')}`,
      );
    }

    const urls = await this.cloudinaryService.uploadImages(images, targetFolder);
    return { urls };
  }
}
