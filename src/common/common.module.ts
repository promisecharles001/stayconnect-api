import { Module, Global } from '@nestjs/common';
import { NotificationService } from './services/notification.service';
import { CloudinaryService } from './services/cloudinary.service';
import { PushNotificationService } from './services/push-notification.service';
import { UploadController } from './controllers/upload.controller';
import { ConfigController } from './controllers/config.controller';

@Global()
@Module({
  controllers: [UploadController, ConfigController],
  providers: [NotificationService, CloudinaryService, PushNotificationService],
  exports: [NotificationService, CloudinaryService, PushNotificationService],
})
export class CommonModule {}
