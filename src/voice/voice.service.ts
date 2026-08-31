import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient, CreateOptions } from 'livekit-server-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationService } from '../common/services/push-notification.service';

export interface TokenGenerationParams {
  bookingId?: string;
  propertyId?: string;
  participantName?: string;
}

export interface GeneratedToken {
  token: string;
  roomName: string;
  serverUrl: string;
  expiresIn: number;
}

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly serverUrl: string;
  private readonly tokenExpiration: number;
  private roomServiceClient: RoomServiceClient | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly pushNotifications: PushNotificationService,
  ) {
    this.apiKey = this.configService.get<string>('LIVEKIT_API_KEY') || '';
    this.apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET') || '';
    this.serverUrl = this.configService.get<string>('LIVEKIT_SERVER_URL')
      || this.configService.get<string>('LIVEKIT_URL')
      || '';
    // Env vars arrive as strings, and the <number> type argument is a claim
    // about the value, not a conversion. Passing the raw "3600" through as
    // AccessToken's ttl made the SDK read it as a time period ("1h", "10m")
    // rather than seconds, so every token threw "Invalid time period format"
    // and voice calling 500'd. Coerce it here.
    const configuredExpiration = Number(
      this.configService.get('LIVEKIT_TOKEN_EXPIRATION'),
    );
    this.tokenExpiration =
      Number.isFinite(configuredExpiration) && configuredExpiration > 0
        ? configuredExpiration
        : 3600;

    if (!this.apiKey) {
      this.logger.warn('LIVEKIT_API_KEY is not configured. Voice calling will not work.');
    }

    if (!this.apiSecret) {
      this.logger.warn('LIVEKIT_API_SECRET is not configured. Token generation will not work.');
    }

    if (!this.serverUrl) {
      this.logger.warn('LIVEKIT_SERVER_URL is not configured. Voice calling will not work.');
    }

    // Initialize RoomServiceClient if credentials are available
    if (this.apiKey && this.apiSecret && this.serverUrl) {
      this.roomServiceClient = new RoomServiceClient(this.serverUrl, this.apiKey, this.apiSecret);
    }
  }

  /**
   * Generate a LiveKit access token for a voice call.
   *
   * Two entry points, both of which put the two parties in the same
   * deterministic room so the callee can join what the caller opened:
   *
   *  - bookingId  — caller must be that booking's visitor or host.
   *  - propertyId — a visitor calling a host about a listing, before any
   *                 booking exists. The host of the property is the callee.
   *
   * Calls used to require a booking with verified payment. That gate was
   * removed deliberately: enquiring by phone before booking is the point.
   * Note this weakens the anti-circumvention posture that pairs with message
   * redaction — the two parties can now reach each other before any money
   * moves through the platform.
   */
  async generateToken(params: TokenGenerationParams, userId: string): Promise<GeneratedToken> {
    const { bookingId, propertyId, participantName } = params;

    if (!this.apiKey || !this.apiSecret || !this.serverUrl) {
      throw new Error('LiveKit credentials are not configured');
    }

    if (!bookingId && !propertyId) {
      throw new BadRequestException('Provide either a bookingId or a propertyId');
    }

    let roomName: string;
    let identity: string;
    let calleeId: string;
    let contextTitle: string;

    if (bookingId) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          visitor: { select: { firstName: true, lastName: true } },
          host: { select: { firstName: true, lastName: true } },
          property: { select: { title: true } },
        },
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      const isParticipant = booking.visitorId === userId || booking.hostId === userId;
      if (!isParticipant) {
        throw new ForbiddenException('You are not a participant in this booking');
      }

      roomName = `booking-${bookingId}`;
      const isVisitor = booking.visitorId === userId;
      const person = isVisitor ? booking.visitor : booking.host;
      identity = participantName || `${person.firstName} ${person.lastName}`;
      calleeId = isVisitor ? booking.hostId : booking.visitorId;
      contextTitle = booking.property?.title ?? 'your booking';
    } else {
      const property = await this.prisma.property.findUnique({
        where: { id: propertyId },
        select: { id: true, title: true, hostId: true },
      });

      if (!property) {
        throw new NotFoundException('Property not found');
      }

      const caller = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });

      // One room per (property, visitor) pair. When the host answers the
      // push we send below, they are handed this same name, so both sides
      // land in the same room without a booking to key off.
      const visitorId = property.hostId === userId ? null : userId;
      if (!visitorId) {
        throw new ForbiddenException('You cannot call yourself about your own listing');
      }

      roomName = `property-${property.id}-${visitorId}`;
      identity = participantName || `${caller?.firstName ?? ''} ${caller?.lastName ?? ''}`.trim() || 'Visitor';
      calleeId = property.hostId;
      contextTitle = property.title;
    }

    const accessToken = new AccessToken(this.apiKey, this.apiSecret, {
      identity,
      ttl: this.tokenExpiration,
    });

    accessToken.addGrant({
      room: roomName,
      roomJoin: true,
      roomAdmin: false,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await accessToken.toJwt();

    this.logger.log(
      `LiveKit token issued — ${bookingId ? `booking: ${bookingId}` : `property: ${propertyId}`}, ` +
        `caller: ${userId}, room: ${roomName}`,
    );

    // Ring the other side. Without this the caller sits alone in a room the
    // callee has no way of knowing exists — there is no signalling channel
    // here beyond the push. Never let a failed push fail the call: the
    // caller can still be joined by someone who opens the same room.
    this.pushNotifications
      .sendToUser(calleeId, {
        title: `${identity} is calling`,
        body: `About ${contextTitle}`,
        data: { type: 'call', roomName, propertyId, bookingId, callerName: identity },
      })
      .catch((err) => this.logger.error(`Call push to ${calleeId} failed:`, err));

    return {
      token,
      roomName,
      serverUrl: this.serverUrl,
      expiresIn: this.tokenExpiration,
    };
  }

  /**
   * Create a new room (optional, rooms are auto-created on join)
   */
  async createRoom(name: string): Promise<void> {
    if (!this.roomServiceClient) {
      throw new Error('LiveKit client not configured');
    }

    const options: CreateOptions = {
      name,
      emptyTimeout: 10 * 60, // 10 minutes
      maxParticipants: 10,
    };

    await this.roomServiceClient.createRoom(options);
    this.logger.log(`Created LiveKit room: ${name}`);
  }

  /**
   * Delete a room
   */
  async deleteRoom(roomName: string): Promise<void> {
    if (!this.roomServiceClient) {
      throw new Error('LiveKit client not configured');
    }

    await this.roomServiceClient.deleteRoom(roomName);
    this.logger.log(`Deleted LiveKit room: ${roomName}`);
  }

  /**
   * Get LiveKit configuration status
   * @returns Configuration status
   */
  getConfigStatus(): {
    configured: boolean;
    apiKeyConfigured: boolean;
    apiSecretConfigured: boolean;
    serverUrlConfigured: boolean;
    tokenExpiration: number;
  } {
    return {
      configured: !!this.apiKey && !!this.apiSecret && !!this.serverUrl,
      apiKeyConfigured: !!this.apiKey,
      apiSecretConfigured: !!this.apiSecret,
      serverUrlConfigured: !!this.serverUrl,
      tokenExpiration: this.tokenExpiration,
    };
  }
}
