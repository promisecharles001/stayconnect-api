import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { VoiceService } from './voice.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationService } from '../common/services/push-notification.service';
import { createPrismaMock, PrismaMock, bookingRow, propertyRow } from '../test-support/prisma-mock';

/**
 * Calls are point-to-point audio between two strangers, so who is allowed to
 * open a room matters. There is also no signalling other than the push this
 * service sends — without it the caller sits in a room the callee has no way
 * of knowing exists, which is how this shipped originally.
 */
describe('VoiceService', () => {
  let service: VoiceService;
  let prisma: PrismaMock;
  let push: { sendToUser: jest.Mock };

  beforeEach(async () => {
    prisma = createPrismaMock();
    push = { sendToUser: jest.fn().mockResolvedValue(undefined) };

    const config: Record<string, string> = {
      LIVEKIT_API_KEY: 'devkey',
      LIVEKIT_API_SECRET: 'secretsecretsecretsecretsecret32',
      LIVEKIT_SERVER_URL: 'wss://example.livekit.cloud',
      LIVEKIT_TOKEN_EXPIRATION: '3600',
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        VoiceService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (k: string) => config[k] } },
        { provide: PushNotificationService, useValue: push },
      ],
    }).compile();

    service = moduleRef.get(VoiceService);
  });

  it('reads the token lifetime as a number of seconds', async () => {
    prisma.booking.findUnique.mockResolvedValue({
      ...bookingRow({ paymentVerified: true }),
      visitor: { firstName: 'V', lastName: 'One' },
      host: { firstName: 'H', lastName: 'One' },
      property: { title: 'Test Property' },
    });

    const result = await service.generateToken({ bookingId: 'b-1' }, 'visitor-1');

    // configService.get<number>() does not convert — it only asserts. The
    // string "3600" reached LiveKit as a time period rather than seconds and
    // every call 500'd with "Invalid time period format".
    expect(result.expiresIn).toBe(3600);
    expect(typeof result.expiresIn).toBe('number');
    expect(result.token.split('.')).toHaveLength(3);
  });

  describe('booking calls', () => {
    beforeEach(() => {
      prisma.booking.findUnique.mockResolvedValue({
        ...bookingRow({ paymentVerified: true }),
        visitor: { firstName: 'V', lastName: 'One' },
        host: { firstName: 'H', lastName: 'One' },
        property: { title: 'Test Property' },
      });
    });

    it('puts both parties in the same room', async () => {
      const asVisitor = await service.generateToken({ bookingId: 'b-1' }, 'visitor-1');
      const asHost = await service.generateToken({ bookingId: 'b-1' }, 'host-1');

      expect(asVisitor.roomName).toBe(asHost.roomName);
    });

    it('refuses someone who is not on the booking', async () => {
      await expect(
        service.generateToken({ bookingId: 'b-1' }, 'a-stranger'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rings the other party', async () => {
      await service.generateToken({ bookingId: 'b-1' }, 'visitor-1');

      expect(push.sendToUser).toHaveBeenCalledWith(
        'host-1',
        expect.objectContaining({ data: expect.objectContaining({ type: 'call' }) }),
      );
    });
  });

  describe('property calls', () => {
    beforeEach(() => {
      prisma.property.findUnique.mockResolvedValue(propertyRow());
      prisma.user.findUnique.mockResolvedValue({ firstName: 'V', lastName: 'One' });
    });

    it('lets a visitor call the host of a listing with no booking', async () => {
      const result = await service.generateToken({ propertyId: 'property-1' }, 'visitor-1');

      expect(result.roomName).toBe('property-property-1-visitor-1');
      expect(push.sendToUser).toHaveBeenCalledWith('host-1', expect.anything());
    });

    it('refuses a host calling about their own listing', async () => {
      await expect(
        service.generateToken({ propertyId: 'property-1' }, 'host-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('404s on a listing that does not exist', async () => {
      prisma.property.findUnique.mockResolvedValue(null);

      await expect(
        service.generateToken({ propertyId: 'nope' }, 'visitor-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  it('requires either a booking or a property', async () => {
    await expect(service.generateToken({}, 'visitor-1')).rejects.toThrow(BadRequestException);
  });

  it('still issues a token if the ring notification fails', async () => {
    prisma.property.findUnique.mockResolvedValue(propertyRow());
    prisma.user.findUnique.mockResolvedValue({ firstName: 'V', lastName: 'One' });
    push.sendToUser.mockRejectedValue(new Error('expo down'));

    // A push that cannot be delivered should not take the call down with it.
    await expect(
      service.generateToken({ propertyId: 'property-1' }, 'visitor-1'),
    ).resolves.toHaveProperty('token');
  });

  // A property call has no symmetric "other side" to derive a room from —
  // the room name embeds the *visitor's* id, which a host has no way to
  // reconstruct from their own. Before roomName existed as a way to hand the
  // host the exact room the visitor opened, this was a hard rejection: the
  // caller connected to an empty room and had no idea the callee's join had
  // just failed outright.
  describe('answering a property call', () => {
    beforeEach(() => {
      prisma.property.findUnique.mockResolvedValue(propertyRow());
      prisma.user.findUnique.mockResolvedValue({ id: 'visitor-1', firstName: 'H', lastName: 'One' });
    });

    it('lets the host join using the room name from the push', async () => {
      const result = await service.generateToken(
        { propertyId: 'property-1', roomName: 'property-property-1-visitor-1' },
        'host-1',
      );

      expect(result.roomName).toBe('property-property-1-visitor-1');
    });

    it('does not re-notify anyone when the host answers', async () => {
      await service.generateToken(
        { propertyId: 'property-1', roomName: 'property-property-1-visitor-1' },
        'host-1',
      );

      expect(push.sendToUser).not.toHaveBeenCalled();
    });

    it('rejects a room name for a different property', async () => {
      await expect(
        service.generateToken(
          { propertyId: 'property-1', roomName: 'property-some-other-property-visitor-1' },
          'host-1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a room name whose visitor does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.generateToken(
          { propertyId: 'property-1', roomName: 'property-property-1-nobody' },
          'host-1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('still refuses a host with no room name at all', async () => {
      // Unchanged from before roomName existed: a host with nothing to
      // answer is not "starting" a call, since there is no such button —
      // they simply have nothing to join.
      await expect(
        service.generateToken({ propertyId: 'property-1' }, 'host-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // Unlike property calls, either side of a booking can start a call — so
  // before this distinction existed, whichever side answered by calling this
  // same endpoint re-ran the "start a call" path and fired a second
  // "is calling" push back at whoever was already sitting in the room
  // waiting for them.
  describe('answering a booking call', () => {
    beforeEach(() => {
      prisma.booking.findUnique.mockResolvedValue({
        ...bookingRow({ paymentVerified: true }),
        visitor: { firstName: 'V', lastName: 'One' },
        host: { firstName: 'H', lastName: 'One' },
        property: { title: 'Test Property' },
      });
    });

    it('joins the same room without paging the other party again', async () => {
      const result = await service.generateToken(
        { bookingId: 'b-1', roomName: 'booking-b-1' },
        'host-1',
      );

      expect(result.roomName).toBe('booking-b-1');
      expect(push.sendToUser).not.toHaveBeenCalled();
    });

    it('rejects a room name for a different booking', async () => {
      await expect(
        service.generateToken(
          { bookingId: 'b-1', roomName: 'booking-some-other-booking' },
          'host-1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
