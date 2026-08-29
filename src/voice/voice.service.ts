import { Injectable, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient, CreateOptions } from 'livekit-server-sdk';
import { PrismaService } from '../prisma/prisma.service';

export interface TokenGenerationParams {
  bookingId: string;
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
   * Generate a LiveKit access token for a booking voice call.
   * The caller must be the visitor or host of the booking, and payment must
   * be verified — enforcing that contact only happens after the platform
   * has confirmed money was received.
   */
  async generateToken(params: TokenGenerationParams, userId: string): Promise<GeneratedToken> {
    const { bookingId, participantName } = params;

    if (!this.apiKey || !this.apiSecret || !this.serverUrl) {
      throw new Error('LiveKit credentials are not configured');
    }

    // Load the booking and verify the caller is a participant
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

    // Gate: voice calls are only allowed after payment is verified
    if (!booking.paymentVerified) {
      throw new ForbiddenException(
        'Voice calls are unlocked after payment is verified. ' +
        'Upload your payment receipt and wait for admin confirmation.',
      );
    }

    // Both visitor and host get a token for the SAME deterministic room
    const roomName = `booking-${bookingId}`;

    const isVisitor = booking.visitorId === userId;
    const person = isVisitor ? booking.visitor : booking.host;
    const identity = participantName || `${person.firstName} ${person.lastName}`;

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
      `LiveKit token issued — booking: ${bookingId}, user: ${userId} (${isVisitor ? 'visitor' : 'host'}), room: ${roomName}`,
    );

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
