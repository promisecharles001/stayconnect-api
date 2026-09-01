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
});
