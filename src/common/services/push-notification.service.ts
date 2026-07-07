import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const EXPO_PUSH_API = 'https://exp.host/--/api/v2/push/send';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Sends push notifications via Expo's push service.
 *
 * This is intentionally a thin wrapper around a plain fetch call rather
 * than the expo-server-sdk package — one HTTP call, no extra dependency
 * to keep in sync. If you outgrow this (e.g. need delivery-receipt
 * polling at scale), swap to expo-server-sdk without changing callers.
 */
@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Look up a user's push token and send, if they have one registered. */
  async sendToUser(userId: string, payload: PushNotificationPayload): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { pushToken: true },
    });

    if (!user?.pushToken) return;

    await this.send(user.pushToken, payload, userId);
  }

  async sendToUsers(userIds: string[], payload: PushNotificationPayload): Promise<void> {
    await Promise.all(userIds.map((id) => this.sendToUser(id, payload)));
  }

  private async send(
    token: string,
    payload: PushNotificationPayload,
    userId: string,
  ): Promise<void> {
    try {
      const response = await fetch(EXPO_PUSH_API, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: token,
          title: payload.title,
          body: payload.body,
          data: payload.data || {},
          sound: 'default',
        }),
      });

      const result = await response.json();
      const ticket = Array.isArray(result?.data) ? result.data[0] : result?.data;

      if (ticket?.status === 'error') {
        this.logger.warn(`Push send failed for user ${userId}: ${ticket.message}`);

        // Token is no longer valid (uninstalled app, etc) — clear it so we
        // stop trying and the row doesn't lie about notification state.
        if (ticket.details?.error === 'DeviceNotRegistered') {
          await this.prisma.user.update({
            where: { id: userId },
            data: { pushToken: null },
          });
        }
      }
    } catch (error) {
      // Push delivery is best-effort — never let a failed push notification
      // break the request that triggered it (sending a message, reviewing
      // KYC, etc).
      this.logger.warn(`Push send error for user ${userId}: ${(error as Error).message}`);
    }
  }
}
