import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ConversationResponseDto, ConversationsResponseDto } from './dto/conversation-response.dto';
import { MessageResponseDto, MessagesResponseDto } from './dto/message-response.dto';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  // Get all conversations for a user (as guest or host)
  async getUserConversations(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<ConversationsResponseDto> {
    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where: {
          OR: [{ guestId: userId }, { hostId: userId }],
        },
        include: {
          property: {
            select: {
              id: true,
              title: true,
              images: true,
            },
          },
          guest: {
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
          OR: [{ guestId: userId }, { hostId: userId }],
        },
      }),
    ]);

    const conversationDtos: ConversationResponseDto[] = conversations.map((conv) => {
      const lastMessage = conv.messages[0];
      return {
        id: conv.id,
        propertyId: conv.propertyId,
        propertyTitle: conv.property.title,
        propertyImage: conv.property.images?.[0] || null,
        guestId: conv.guestId,
        guestName: `${conv.guest.firstName} ${conv.guest.lastName}`,
        hostId: conv.hostId,
        hostName: `${conv.host.firstName} ${conv.host.lastName}`,
        lastMessage: lastMessage?.content || null,
        lastMessageAt: lastMessage?.createdAt || null,
        unreadCount: 0, // TODO: Calculate unread messages
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
        OR: [{ guestId: userId }, { hostId: userId }],
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
    guestId: string,
    dto: CreateConversationDto,
  ): Promise<ConversationResponseDto> {
    // Check if conversation already exists
    const existing = await this.prisma.conversation.findUnique({
      where: {
        propertyId_guestId_hostId: {
          propertyId: dto.propertyId,
          guestId,
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

    // Create conversation with initial message if provided
    const conversation = await this.prisma.conversation.create({
      data: {
        propertyId: dto.propertyId,
        guestId,
        hostId: dto.hostId,
        messages: dto.initialMessage
          ? {
              create: {
                senderId: guestId,
                content: dto.initialMessage,
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
        guest: {
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

    return {
      id: conversation.id,
      propertyId: conversation.propertyId,
      propertyTitle: conversation.property.title,
      propertyImage: conversation.property.images?.[0] || null,
      guestId: conversation.guestId,
      guestName: `${conversation.guest.firstName} ${conversation.guest.lastName}`,
      hostId: conversation.hostId,
      hostName: `${conversation.host.firstName} ${conversation.host.lastName}`,
      lastMessage: lastMessage?.content || null,
      lastMessageAt: lastMessage?.createdAt || null,
      unreadCount: 0,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
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
        OR: [{ guestId: senderId }, { hostId: senderId }],
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Create message and update conversation timestamp
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId: dto.conversationId,
          senderId,
          content: dto.content,
        },
      }),
      this.prisma.conversation.update({
        where: { id: dto.conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);

    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      content: message.content,
      isRead: message.isRead,
      readAt: message.readAt,
      createdAt: message.createdAt,
    };
  }

  // Get or create conversation (for starting a chat from property)
  async getOrCreateConversation(
    guestId: string,
    propertyId: string,
    hostId: string,
    initialMessage?: string,
  ): Promise<ConversationResponseDto> {
    // Try to find existing conversation
    const existing = await this.prisma.conversation.findUnique({
      where: {
        propertyId_guestId_hostId: {
          propertyId,
          guestId,
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
        guest: {
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
        guestId: existing.guestId,
        guestName: `${existing.guest.firstName} ${existing.guest.lastName}`,
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
    return this.createConversation(guestId, { propertyId, hostId, initialMessage });
  }
}
