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
  roomName?: string;
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
   * This same endpoint serves both starting a call and answering one — the
   * app calls it a second time, as the other party, once the "is calling"
   * push is tapped. `roomName` is how the request says which of those two
   * it is: absent means "start a new call, derive the room, page the other
   * side"; present means "join the room I was just handed, don't page
   * anyone again."
   *
   * That distinction used to not exist, and it broke both directions:
   *   - Property calls have no symmetric "other side" to derive from (the
   *     room name embeds the *visitor's* id, which a host has no way to
   *     reconstruct from their own). Without a way to hand the host that
   *     room name, the "self-call" guard below rejected the host's own join
   *     attempt outright — the caller ended up alone in a room believing
   *     they were connected, because nothing ever told them the other side
   *     had actually failed to join.
   *   - Booking calls have a real participant on both sides, so answering
   *     one used to succeed — but it re-ran the same code path as starting
   *     a call, which re-fired an "X is calling" push at whoever was
   *     already sitting in the room waiting.
   *
   * Calls used to require a booking with verified payment. That gate was
   * removed deliberately: enquiring by phone before booking is the point.
   * Note this weakens the anti-circumvention posture that pairs with message
   * redaction — the two parties can now reach each other before any money
   * moves through the platform.
   */
  async generateToken(params: TokenGenerationParams, userId: string): Promise<GeneratedToken> {
    const { bookingId, propertyId, participantName, roomName: requestedRoomName } = params;

    if (!this.apiKey || !this.apiSecret || !this.serverUrl) {
      throw new Error('LiveKit credentials are not configured');
    }

    if (!bookingId && !propertyId) {
      throw new BadRequestException('Provide either a bookingId or a propertyId');
    }

    let roomName: string;
    let identity: string;
    // null means "this is an answer, not a call" — don't page anyone.
    let calleeId: string | null;
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

      const derivedRoomName = `booking-${bookingId}`;
      if (requestedRoomName && requestedRoomName !== derivedRoomName) {
        throw new ForbiddenException('That call is no longer valid.');
      }

      roomName = derivedRoomName;
      const isVisitor = booking.visitorId === userId;
      const person = isVisitor ? booking.visitor : booking.host;
      identity = participantName || `${person.firstName} ${person.lastName}`;
      calleeId = requestedRoomName ? null : isVisitor ? booking.hostId : booking.visitorId;
      contextTitle = booking.property?.title ?? 'your booking';
    } else {
      const property = await this.prisma.property.findUnique({
        where: { id: propertyId },
        select: { id: true, title: true, hostId: true },
      });

      if (!property) {
        throw new NotFoundException('Property not found');
      }

      const isHost = property.hostId === userId;

      if (isHost) {
        // The host never initiates a property call — there is no "call
        // this visitor" button anywhere for a host — so getting here at
        // all means they're answering one, which requires the room name
        // from the push. Its "property-{propertyId}-{visitorId}" shape is
        // parsed rather than trusted outright: it must genuinely be a room
        // for *this* property, and the embedded id a real user, before the
        // host is handed a token to join it.
        const expectedPrefix = `property-${property.id}-`;
        if (!requestedRoomName || !requestedRoomName.startsWith(expectedPrefix)) {
          throw new ForbiddenException(
            'No active call to answer for this property.',
          );
        }
        const visitorId = requestedRoomName.slice(expectedPrefix.length);
        const visitor = await this.prisma.user.findUnique({
          where: { id: visitorId },
          select: { id: true },
        });
        if (!visitor) {
          throw new ForbiddenException('That call is no longer valid.');
        }

        const host = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { firstName: true, lastName: true },
        });

        roomName = requestedRoomName;
        identity =
          participantName ||
          `${host?.firstName ?? ''} ${host?.lastName ?? ''}`.trim() ||
          'Host';
        calleeId = null;
        contextTitle = property.title;
      } else {
        // One room per (property, visitor) pair, keyed off the visitor's own
        // id — this is always the initiating side for a property call, so
        // there is no answering case to distinguish here.
        const derivedRoomName = `property-${property.id}-${userId}`;
        if (requestedRoomName && requestedRoomName !== derivedRoomName) {
          throw new ForbiddenException('That call is no longer valid.');
        }

        const caller = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { firstName: true, lastName: true },
        });

        roomName = derivedRoomName;
        identity =
          participantName ||
          `${caller?.firstName ?? ''} ${caller?.lastName ?? ''}`.trim() ||
          'Visitor';
        calleeId = property.hostId;
        contextTitle = property.title;
      }
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
        `caller: ${userId}, room: ${roomName}, answering: ${!!requestedRoomName}`,
    );

    // Ring the other side. Without this the caller sits alone in a room the
    // callee has no way of knowing exists — there is no signalling channel
    // here beyond the push. Never let a failed push fail the call: the
    // caller can still be joined by someone who opens the same room. Skipped
    // entirely when calleeId is null — that means this request is itself the
    // answer to a call already in progress, and paging the person who is
    // already sitting in the room waiting would be a bug, not a courtesy.
    if (calleeId) {
      this.pushNotifications
        .sendToUser(calleeId, {
          title: `${identity} is calling`,
          body: `About ${contextTitle}`,
          data: { type: 'call', roomName, propertyId, bookingId, callerName: identity },
          // A call is the one notification that is worthless if it arrives
          // late — the caller is sitting there waiting right now. High
          // priority asks Android to wake a dozing device rather than
          // batching this until the phone next happens to wake up.
          priority: 'high',
        })
        .catch((err) => this.logger.error(`Call push to ${calleeId} failed:`, err));
    }

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
