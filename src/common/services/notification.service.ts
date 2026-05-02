import { Injectable, Logger } from '@nestjs/common';

interface NotificationPayload {
  type: 'KYC_SUBMITTED' | 'PROPERTY_SUBMITTED' | 'KYC_REVIEWED' | 'PROPERTY_REVIEWED';
  recipientEmail: string;
  subject: string;
  message: string;
  data?: Record<string, any>;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  async sendAdminNotification(payload: NotificationPayload): Promise<void> {
    // Log the notification for now
    // In production, integrate with SMTP (nodemailer), SendGrid, or AWS SES
    this.logger.log(`[ADMIN NOTIFICATION] ${payload.subject}`);
    this.logger.log(`To: ${payload.recipientEmail}`);
    this.logger.log(`Message: ${payload.message}`);

    // TODO: Implement actual email sending
    // Example with nodemailer:
    // await this.transporter.sendMail({
    //   from: process.env.MAIL_FROM,
    //   to: payload.recipientEmail,
    //   subject: payload.subject,
    //   text: payload.message,
    // });
  }

  async notifyNewKycSubmitted(adminEmail: string, userName: string, userEmail: string): Promise<void> {
    await this.sendAdminNotification({
      type: 'KYC_SUBMITTED',
      recipientEmail: adminEmail,
      subject: `New KYC Verification Submitted - ${userName}`,
      message: `A new KYC verification has been submitted by ${userName} (${userEmail}). Please review it in the admin dashboard.`,
      data: { userName, userEmail },
    });
  }

  async notifyNewPropertySubmitted(
    adminEmail: string,
    propertyTitle: string,
    hostName: string,
    hostEmail: string,
  ): Promise<void> {
    await this.sendAdminNotification({
      type: 'PROPERTY_SUBMITTED',
      recipientEmail: adminEmail,
      subject: `New Property Listing Submitted - ${propertyTitle}`,
      message: `A new property "${propertyTitle}" has been submitted by ${hostName} (${hostEmail}). Please review it in the admin dashboard before it goes live.`,
      data: { propertyTitle, hostName, hostEmail },
    });
  }
}
