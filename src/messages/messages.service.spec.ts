import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesGateway } from './messages.gateway';
import { PushNotificationService } from '../common/services/push-notification.service';
import { createPrismaMock, PrismaMock } from '../test-support/prisma-mock';

/**
 * redactContactInfo exists to stop a phone number or email moving a booking
 * off-platform before payment. A push notification or a stored message that
 * bypasses it defeats the entire feature regardless of how well the regex
 * itself works — these tests are about the two places that turned out to.
 */
describe('MessagesService', () => {
  let service: MessagesService;
  let prisma: PrismaMock;
  let gateway: { emitNewMessage: jest.Mock; emitConversationUpdate: jest.Mock };
  let push: { sendToUser: jest.Mock };

  const conversationRow = (overrides: Record<string, any> = {}) => ({
    id: 'conv-1',
    propertyId: 'property-1',
    visitorId: 'visitor-1',
    hostId: 'host-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    visitor: { firstName: 'Vera', lastName: 'Visitor' },
    host: { firstName: 'Hank', lastName: 'Host' },
    property: { id: 'property-1', title: 'Test Property', images: [] },
    messages: [],
    ...overrides,
  });

  beforeEach(async () => {
    prisma = createPrismaMock();
    gateway = { emitNewMessage: jest.fn(), emitConversationUpdate: jest.fn() };
    push = { sendToUser: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: PrismaService, useValue: prisma },
        { provide: MessagesGateway, useValue: gateway },
        { provide: PushNotificationService, useValue: push },
      ],
    }).compile();

    service = moduleRef.get(MessagesService);
  });

  describe('sendMessage', () => {
    beforeEach(() => {
      prisma.conversation.findFirst.mockResolvedValue(conversationRow());
      prisma.message.create.mockImplementation((args: any) =>
        Promise.resolve({
          id: 'msg-1',
          conversationId: args.data.conversationId,
          senderId: args.data.senderId,
          content: args.data.content,
          isRead: false,
          readAt: null,
          createdAt: new Date(),
        }),
      );
      prisma.conversation.update.mockResolvedValue(conversationRow());
    });

    it('stores the redacted content, not the raw one', async () => {
      const result = await service.sendMessage('visitor-1', {
        conversationId: 'conv-1',
        content: 'call me on 08012345678',
      });

      expect(result.content).toBe('call me on [phone number removed]');
      const stored = prisma.message.create.mock.calls[0][0].data;
      expect(stored.content).toBe('call me on [phone number removed]');
      expect(stored.containsRedactedContact).toBe(true);
    });

    it('pushes the redacted content, not the raw phone number or email', async () => {
      // dto.content (the raw input) used to be read here instead of the
      // already-redacted `content` variable — the exact text the feature
      // exists to hide went out in plain text on the recipient's lock
      // screen even though the stored message and the socket events were
      // both correctly redacted.
      await service.sendMessage('visitor-1', {
        conversationId: 'conv-1',
        content: 'reach me at test@example.com or 08012345678',
      });

      const pushed = push.sendToUser.mock.calls[0][1];
      expect(pushed.body).not.toContain('test@example.com');
      expect(pushed.body).not.toContain('08012345678');
      expect(pushed.body).toContain('[email removed]');
      expect(pushed.body).toContain('[phone number removed]');
    });

    it('leaves ordinary messages untouched', async () => {
      const result = await service.sendMessage('visitor-1', {
        conversationId: 'conv-1',
        content: 'Is the apartment available next weekend?',
      });

      expect(result.content).toBe('Is the apartment available next weekend?');
      expect(push.sendToUser.mock.calls[0][1].body).toBe(
        'Is the apartment available next weekend?',
      );
    });

    it('refuses a sender who is not part of the conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(
        service.sendMessage('a-stranger', { conversationId: 'conv-1', content: 'hi' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createConversation — the opening message', () => {
    beforeEach(() => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.property.findFirst.mockResolvedValue({ id: 'property-1', hostId: 'host-1' });
      prisma.conversation.create.mockImplementation((args: any) =>
        Promise.resolve(
          conversationRow({
            messages: args.data.messages
              ? [
                  {
                    id: 'msg-1',
                    content: args.data.messages.create.content,
                    createdAt: new Date(),
                  },
                ]
              : [],
          }),
        ),
      );
    });

    it('redacts contact info in the very first message of a conversation', async () => {
      // This path never called redactContactInfo at all — sendMessage
      // redacted every message except this one, which is exactly where
      // "Hi, is this available? Call me on 080..." tends to get typed,
      // before either side has reason to hold back.
      const result = await service.createConversation('visitor-1', {
        propertyId: 'property-1',
        hostId: 'host-1',
        initialMessage: 'Hi, call me on 08012345678 about this place',
      });

      expect(result.lastMessage).toBe('Hi, call me on [phone number removed] about this place');
      const stored = prisma.conversation.create.mock.calls[0][0].data.messages.create;
      expect(stored.content).toBe('Hi, call me on [phone number removed] about this place');
      expect(stored.containsRedactedContact).toBe(true);
    });

    it('notifies the host of the opening message, not just the socket event', async () => {
      // createConversation never sent a push at all — a host without the
      // app open right now had no way to learn a new conversation existed
      // until they happened to open it, while every later reply in that
      // same conversation did page them via sendMessage.
      await service.createConversation('visitor-1', {
        propertyId: 'property-1',
        hostId: 'host-1',
        initialMessage: 'Is this still available?',
      });

      expect(push.sendToUser).toHaveBeenCalledWith(
        'host-1',
        expect.objectContaining({ body: 'Is this still available?' }),
      );
    });

    it('sends no push when the conversation is started with no message', async () => {
      await service.createConversation('visitor-1', {
        propertyId: 'property-1',
        hostId: 'host-1',
      });

      expect(push.sendToUser).not.toHaveBeenCalled();
    });
  });
});
