import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private readonly configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadImage(base64Image: string, folder: string = 'stayconnect/properties'): Promise<string> {
    try {
      // Ensure base64 image has proper prefix
      const imageData = base64Image.startsWith('data:')
        ? base64Image
        : `data:image/jpeg;base64,${base64Image}`;

      const result = await cloudinary.uploader.upload(imageData, {
        folder,
        resource_type: 'image',
        transformation: [
          { width: 1200, height: 900, crop: 'limit' },
          { quality: 'auto:good' },
          { fetch_format: 'auto' },
        ],
      });

      this.logger.log(`Image uploaded to Cloudinary: ${result.secure_url}`);
      return result.secure_url;
    } catch (error) {
      this.logger.error('Cloudinary upload failed:', error);
      throw new Error('Failed to upload image to cloud storage');
    }
  }

  async uploadImages(base64Images: string[], folder: string = 'stayconnect/properties'): Promise<string[]> {
    const uploadPromises = base64Images.map((img, index) =>
      this.uploadImage(img, folder).catch((err) => {
        this.logger.error(`Failed to upload image ${index + 1}:`, err);
        throw err;
      })
    );

    return Promise.all(uploadPromises);
  }

  async deleteImage(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId);
      this.logger.log(`Image deleted from Cloudinary: ${publicId}`);
    } catch (error) {
      this.logger.error('Cloudinary delete failed:', error);
    }
  }
}
