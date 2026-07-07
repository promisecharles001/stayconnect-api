import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

/**
 * Real-time messaging gateway.
 *
 * The REST endpoints in MessagesController/MessagesService remain the
 * source of truth (send a message, fetch history, etc). This gateway is a
 * thin push layer on top: clients connect once, join the conversation
 * room(s) they currently have open, and MessagesService notifies this
 * gateway after a message/conversation is persisted so it can push the
 * update to anyone listening. If the socket is unavailable for any reason,
 * the REST flow still works exactly as before — this is additive.
 */
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
    credentials: true,
  },
  namespace: '/messages',
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessagesGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.query?.token as string | undefined) ||
        client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        throw new UnauthorizedException('No token provided');
      }

      const payload = this.jwtService.verify<{ sub: string }>(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });

      client.userId = payload.sub;
      // Personal room so we can push conversation-list updates (new
      // message previews, unread counts) to this user on any screen,
      // not just while they have a specific conversation open.
      await client.join(`user:${payload.sub}`);

      this.logger.log(`Socket connected: user ${payload.sub} (${client.id})`);
    } catch (error) {
      this.logger.warn(`Socket auth failed: ${(error as Error).message}`);
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      this.logger.log(`Socket disconnected: user ${client.userId} (${client.id})`);
    }
  }

  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ): Promise<void> {
    if (!client.userId || !data?.conversationId) return;

    // Verify the user actually belongs to this conversation before letting
    // them join its room — otherwise any authenticated socket could listen
    // in on any conversation by guessing/enumerating conversation IDs.
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: data.conversationId,
        OR: [{ visitorId: client.userId }, { hostId: client.userId }],
      },
      select: { id: true },
    });

    if (!conversation) {
      client.emit('error', { message: 'Conversation not found or access denied' });
      return;
    }

    await client.join(`conversation:${data.conversationId}`);
  }

  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ): void {
    if (!data?.conversationId) return;
    client.leave(`conversation:${data.conversationId}`);
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ): void {
    if (!client.userId || !data?.conversationId) return;
    client.to(`conversation:${data.conversationId}`).emit('typing', {
      userId: client.userId,
      isTyping: data.isTyping,
    });
  }

  /** Push a newly-sent message to anyone with that conversation open. */
  emitNewMessage(conversationId: string, message: unknown): void {
    this.server.to(`conversation:${conversationId}`).emit('new_message', message);
  }

  /**
   * Push a conversation-list update (new/changed conversation, last
   * message preview, etc) to specific users' personal rooms — never a
   * blanket broadcast, since the payload can include the other
   * participant's name and message preview.
   */
  emitConversationUpdate(userIds: string[], conversation: unknown): void {
    for (const userId of userIds) {
      this.server.to(`user:${userId}`).emit('conversation_update', conversation);
    }
  }
}
