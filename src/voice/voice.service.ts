import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient, CreateOptions } from 'livekit-server-sdk';
import { v4 as uuidv4 } from 'uuid';

export interface TokenGenerationParams {
  roomName: string;
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

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('LIVEKIT_API_KEY') || '';
    this.apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET') || '';
    this.serverUrl = this.configService.get<string>('LIVEKIT_SERVER_URL')
      || this.configService.get<string>('LIVEKIT_URL')
      || '';
    this.tokenExpiration = this.configService.get<number>('LIVEKIT_TOKEN_EXPIRATION') || 3600;

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
   * Generate a LiveKit access token for voice calling
   * @param params - Token generation parameters
   * @param userId - Authenticated user ID
   * @returns Generated token with metadata
   */
  async generateToken(params: TokenGenerationParams, userId: number): Promise<GeneratedToken> {
    const { roomName, participantName } = params;

    // Validate configuration
    if (!this.apiKey || !this.apiSecret || !this.serverUrl) {
      throw new Error('LiveKit credentials are not configured');
    }

    // Validate room name format (security)
    if (!this.isValidRoomName(roomName)) {
      throw new Error('Invalid room name format');
    }

    // Create a secure room name with user context
    const secureRoomName = `${roomName}-${userId}-${uuidv4().substring(0, 8)}`;
    
    // Create participant identity
    const identity = participantName || `user-${userId}-${Date.now()}`;

    // Create the access token
    const accessToken = new AccessToken(this.apiKey, this.apiSecret, {
      identity,
      ttl: this.tokenExpiration,
    });

    // Grant permissions to the room
    accessToken.addGrant({
      room: secureRoomName,
      roomJoin: true,
      roomAdmin: false,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    // Generate the JWT token
    const token = await accessToken.toJwt();

    this.logger.log(`Generated LiveKit token for user: ${userId}, room: ${secureRoomName}, identity: ${identity}`);

    return {
      token,
      roomName: secureRoomName,
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
   * Validate room name format
   */
  private isValidRoomName(roomName: string): boolean {
    // Room name should be alphanumeric with hyphens/underscores only
    // Length between 1 and 64 characters
    const roomNameRegex = /^[a-zA-Z0-9_-]{1,64}$/;
    return roomNameRegex.test(roomName);
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
