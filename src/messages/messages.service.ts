import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ConversationResponseDto, ConversationsResponseDto } from './dto/conversation-response.dto';
import { MessageResponseDto, MessagesResponseDto } from './dto/message-response.dto';
import { MessagesGateway } from './messages.gateway';
import { PushNotificationService } from '../common/services/push-notification.service';
import { redactContactInfo } from './utils/contact-redaction.util';

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private readonly gateway: MessagesGateway,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  // Get all conversations for a user (as visitor or host)
  async getUserConversations(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<ConversationsResponseDto> {
    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where: {
          OR: [{ visitorId: userId }, { hostId: userId }],
        },
        include: {
          property: {
            select: {
              id: true,
              title: true,
              images: true,
            },
          },
          visitor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          host: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.conversation.count({
        where: {
          OR: [{ visitorId: userId }, { hostId: userId }],
        },
      }),
    ]);

    const conversationIds = conversations.map((c) => c.id);

    // One grouped query for all conversations on this page, rather than a
    // per-conversation count query — keeps this from scaling linearly with
    // page size.
    const unreadGroups = conversationIds.length
      ? await this.prisma.message.groupBy({
          by: ['conversationId'],
          where: {
            conversationId: { in: conversationIds },
            senderId: { not: userId },
            isRead: false,
          },
          _count: { _all: true },
        })
      : [];

    const unreadByConversation = new Map(
      unreadGroups.map((g) => [g.conversationId, g._count._all]),
    );

    const conversationDtos: ConversationResponseDto[] = conversations.map((conv) => {
      const lastMessage = conv.messages[0];
      return {
        id: conv.id,
        propertyId: conv.propertyId,
        propertyTitle: conv.property.title,
        propertyImage: conv.property.images?.[0] || null,
        visitorId: conv.visitorId,
        visitorName: `${conv.visitor.firstName} ${conv.visitor.lastName}`,
        hostId: conv.hostId,
        hostName: `${conv.host.firstName} ${conv.host.lastName}`,
        lastMessage: lastMessage?.content || null,
        lastMessageAt: lastMessage?.createdAt || null,
        unreadCount: unreadByConversation.get(conv.id) || 0,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      };
    });

    return {
      conversations: conversationDtos,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Get messages for a specific conversation
  async getConversationMessages(
    conversationId: string,
    userId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<MessagesResponseDto> {
    // Verify user is part of this conversation
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [{ visitorId: userId }, { hostId: userId }],
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.message.count({
        where: { conversationId },
      }),
    ]);

    // Mark messages as read
    await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        isRead: false,
      },
      data: { isRead: true, readAt: new Date() },
    });

    const messageDtos: MessageResponseDto[] = messages.map((msg) => ({
      id: msg.id,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      content: msg.content,
      isRead: msg.isRead,
      readAt: msg.readAt,
      createdAt: msg.createdAt,
    }));

    return {
      messages: messageDtos.reverse(), // Return oldest first
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Create a new conversation
  async createConversation(
    visitorId: string,
    dto: CreateConversationDto,
  ): Promise<ConversationResponseDto> {
    // Check if conversation already exists
    const existing = await this.prisma.conversation.findUnique({
      where: {
        propertyId_visitorId_hostId: {
          propertyId: dto.propertyId,
          visitorId,
          hostId: dto.hostId,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Conversation already exists');
    }

    // Verify property exists and belongs to the host
    const property = await this.prisma.property.findFirst({
      where: {
        id: dto.propertyId,
        hostId: dto.hostId,
      },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    // sendMessage() redacts every message that follows — this is the one
    // that did not, because it never called redactContactInfo at all. That
    // makes it the single biggest hole in the whole feature: the opening
    // message of a conversation is exactly where "Hi, is this available?
    // Call me on 080..." tends to get typed, before either side has reason
    // to hold back, and it was going straight into the database, the
    // conversation list preview, and the chat screen untouched.
    const initialMessage = dto.initialMessage
      ? redactContactInfo(dto.initialMessage)
      : null;

    // Create conversation with initial message if provided
    const conversation = await this.prisma.conversation.create({
      data: {
        propertyId: dto.propertyId,
        visitorId,
        hostId: dto.hostId,
        messages: initialMessage
          ? {
              create: {
                senderId: visitorId,
                content: initialMessage.content,
                containsRedactedContact: initialMessage.wasRedacted,
              },
            }
          : undefined,
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            images: true,
          },
        },
        visitor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        host: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const lastMessage = conversation.messages[0];

    const conversationDto: ConversationResponseDto = {
      id: conversation.id,
      propertyId: conversation.propertyId,
      propertyTitle: conversation.property.title,
      propertyImage: conversation.property.images?.[0] || null,
      visitorId: conversation.visitorId,
      visitorName: `${conversation.visitor.firstName} ${conversation.visitor.lastName}`,
      hostId: conversation.hostId,
      hostName: `${conversation.host.firstName} ${conversation.host.lastName}`,
      lastMessage: lastMessage?.content || null,
      lastMessageAt: lastMessage?.createdAt || null,
      unreadCount: 0,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };

    // Let the host's conversation list pick up the new thread live.
    this.gateway.emitConversationUpdate([conversation.hostId], conversationDto);

    // Same reasoning as sendMessage's push: the socket event above only
    // reaches a host with the app open right now. Without this, a visitor's
    // opening message — the one that actually gets a host's attention —
    // went completely unnoticed until they next happened to open the app,
    // while every message after the first one in the conversation did page
    // them.
    if (initialMessage) {
      void this.pushNotificationService.sendToUser(dto.hostId, {
        title: `New message from ${conversation.visitor.firstName} ${conversation.visitor.lastName}`,
        body:
          initialMessage.content.length > 100
            ? `${initialMessage.content.slice(0, 100)}...`
            : initialMessage.content,
        data: { type: 'message', conversationId: conversation.id },
      });
    }

    return conversationDto;
  }

  // Send a message
  async sendMessage(
    senderId: string,
    dto: SendMessageDto,
  ): Promise<MessageResponseDto> {
    // Verify user is part of this conversation
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: dto.conversationId,
        OR: [{ visitorId: senderId }, { hostId: senderId }],
      },
      include: {
        visitor: { select: { firstName: true, lastName: true } },
        host: { select: { firstName: true, lastName: true } },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Strip contact info before it ever reaches the database — visitors and
    // hosts shouldn't be able to exchange a phone number/email to arrange a
    // booking off-platform before payment.
    const { content, wasRedacted } = redactContactInfo(dto.content);

    // Create message and update conversation timestamp
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId: dto.conversationId,
          senderId,
          content,
          containsRedactedContact: wasRedacted,
        },
      }),
      this.prisma.conversation.update({
        where: { id: dto.conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);

    const messageDto: MessageResponseDto = {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      content: message.content,
      isRead: message.isRead,
      readAt: message.readAt,
      createdAt: message.createdAt,
    };

    // Push to anyone with this conversation open right now, and update
    // both participants' conversation lists (last message preview).
    this.gateway.emitNewMessage(dto.conversationId, messageDto);
    this.gateway.emitConversationUpdate(
      [conversation.visitorId, conversation.hostId],
      {
        conversationId: dto.conversationId,
        lastMessage: messageDto.content,
        lastMessageAt: messageDto.createdAt,
      },
    );

    // Also send a device push notification to the recipient — the socket
    // events above only reach someone with the app open right now.
    const isSenderGuest = senderId === conversation.visitorId;
    const recipientId = isSenderGuest ? conversation.hostId : conversation.visitorId;
    const senderName = isSenderGuest
      ? `${conversation.visitor.firstName} ${conversation.visitor.lastName}`
      : `${conversation.host.firstName} ${conversation.host.lastName}`;

    // `content` here — not dto.content. redactContactInfo already ran above;
    // using the raw dto.content put whatever phone number or email a message
    // had just been redacted for in plain text on the recipient's lock
    // screen, which is precisely what this feature exists to stop. The
    // in-app message and the socket events were never affected — only this
    // push body was reading the pre-redaction value.
    void this.pushNotificationService.sendToUser(recipientId, {
      title: `New message from ${senderName}`,
      body: content.length > 100 ? `${content.slice(0, 100)}...` : content,
      data: { type: 'message', conversationId: dto.conversationId },
    });

    return messageDto;
  }

  // Get or create conversation (for starting a chat from property)
  async getOrCreateConversation(
    visitorId: string,
    propertyId: string,
    hostId: string,
    initialMessage?: string,
  ): Promise<ConversationResponseDto> {
    // Try to find existing conversation
    const existing = await this.prisma.conversation.findUnique({
      where: {
        propertyId_visitorId_hostId: {
          propertyId,
          visitorId,
          hostId,
        },
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            images: true,
          },
        },
        visitor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        host: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (existing) {
      const lastMessage = existing.messages[0];
      return {
        id: existing.id,
        propertyId: existing.propertyId,
        propertyTitle: existing.property.title,
        propertyImage: existing.property.images?.[0] || null,
        visitorId: existing.visitorId,
        visitorName: `${existing.visitor.firstName} ${existing.visitor.lastName}`,
        hostId: existing.hostId,
        hostName: `${existing.host.firstName} ${existing.host.lastName}`,
        lastMessage: lastMessage?.content || null,
        lastMessageAt: lastMessage?.createdAt || null,
        unreadCount: 0,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      };
    }

    // Create new conversation
    return this.createConversation(visitorId, { propertyId, hostId, initialMessage });
  }
}
