import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

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
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = this.configService.get<number>('SMTP_PORT');
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');

    if (!smtpHost || !smtpUser || !smtpPass) {
      this.logger.warn('SMTP not fully configured. Email notifications will be logged only.');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort || 587,
      secure: (smtpPort || 587) === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    this.logger.log('SMTP transporter initialized');
  }

  async sendAdminNotification(payload: NotificationPayload): Promise<void> {
    this.logger.log(`[ADMIN NOTIFICATION] ${payload.subject}`);
    this.logger.log(`To: ${payload.recipientEmail}`);
    this.logger.log(`Message: ${payload.message}`);

    if (!this.transporter) {
      this.logger.warn('SMTP not configured. Email not sent — only logged.');
      return;
    }

    try {
      const fromEmail = this.configService.get<string>('SMTP_USER') || 'stayconnectng@gmail.com';
      const appName = this.configService.get<string>('APP_NAME') || 'StayConnect NG';

      await this.transporter.sendMail({
        from: `"${appName}" <${fromEmail}>`,
        to: payload.recipientEmail,
        subject: payload.subject,
        text: payload.message,
        html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #007AFF;">${payload.subject}</h2>
  <p style="font-size: 16px; line-height: 1.6;">${payload.message.replace(/\n/g, '<br>')}</p>
  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">This is an automated notification from StayConnect NG.</p>
</div>`,
      });

      this.logger.log(`Email sent successfully to ${payload.recipientEmail}`);
    } catch (error) {
      this.logger.error('Failed to send email:', error);
    }
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
