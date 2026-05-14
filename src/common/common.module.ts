import { Module, Global } from '@nestjs/common';
import { NotificationService } from './services/notification.service';
import { CloudinaryService } from './services/cloudinary.service';
import { UploadController } from './controllers/upload.controller';

@Global()
@Module({
  controllers: [UploadController],
  providers: [NotificationService, CloudinaryService],
  exports: [NotificationService, CloudinaryService],
})
export class CommonModule {}
