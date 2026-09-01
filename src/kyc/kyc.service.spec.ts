import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { KycService } from './kyc.service';
import { PropertiesService } from '../properties/properties.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../common/services/notification.service';
import { PushNotificationService } from '../common/services/push-notification.service';
import { createPrismaMock, PrismaMock } from '../test-support/prisma-mock';

describe('KYC and the gate it guards', () => {
  let kyc: KycService;
  let properties: PropertiesService;
  let prisma: PrismaMock;

  const submission = {
    documentType: 'NIN_SLIP',
    documentNumber: '12345678901',
    documentImageFront: 'https://example.com/front.jpg',
    selfieImage: 'https://example.com/selfie.jpg',
  };

  beforeEach(async () => {
    prisma = createPrismaMock();

    const moduleRef = await Test.createTestingModule({
      providers: [
        KycService,
        PropertiesService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: NotificationService,
          useValue: {
            notifyNewKycSubmitted: jest.fn(),
            notifyKycReviewed: jest.fn(),
            notifyNewPropertySubmitted: jest.fn(),
          },
        },
        { provide: PushNotificationService, useValue: { sendToUser: jest.fn() } },
      ],
    }).compile();

    kyc = moduleRef.get(KycService);
    properties = moduleRef.get(PropertiesService);
  });

  describe('listing requires approved KYC', () => {
    const listing = {
      title: 'A place',
      description: 'Somewhere to stay',
      propertyType: 'APARTMENT',
      address: '1 Road',
      city: 'Lekki',
      state: 'Lagos',
      maxGuests: 2,
      bedrooms: 1,
      beds: 1,
      bathrooms: 1,
      basePricePerNight: 25000,
    };

    it('refuses a host who has not verified', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'host-1', kycVerification: null });

      await expect(properties.create('host-1', listing as any)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.property.create).not.toHaveBeenCalled();
    });

    it('refuses a host whose KYC is still pending', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'host-1',
        kycVerification: { status: 'PENDING' },
      });

      await expect(properties.create('host-1', listing as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('creates the listing awaiting review once KYC is approved', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'host-1',
        email: 'host@example.com',
        firstName: 'A',
        lastName: 'B',
        kycVerification: { status: 'APPROVED' },
      });
      prisma.property.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...data, id: 'property-1', averageRating: 0, commissionPercent: 10 }),
      );

      await properties.create('host-1', listing as any);

      // Verified hosts still don't get to publish directly.
      const { data } = prisma.property.create.mock.calls[0][0];
      expect(data.status).toBe('PENDING_APPROVAL');
    });
  });

  describe('submitting KYC', () => {
    it('will not reopen an approved verification', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'host-1',
        email: 'host@example.com',
        firstName: 'A',
        lastName: 'B',
      });
      prisma.kYCVerification.findUnique.mockResolvedValue({ id: 'k-1', status: 'APPROVED' });

      await expect(kyc.submitKyc('host-1', submission as any)).rejects.toThrow(ConflictException);
    });

    it('lets a rejected applicant resubmit', async () => {
      prisma.kYCVerification.findUnique.mockResolvedValue({ id: 'k-1', status: 'REJECTED' });
      prisma.kYCVerification.update.mockResolvedValue({ id: 'k-1', status: 'PENDING' });
      prisma.user.findUnique.mockResolvedValue({
        id: 'host-1',
        email: 'host@example.com',
        firstName: 'A',
        lastName: 'B',
      });

      const result = await kyc.submitKyc('host-1', submission as any);

      expect(prisma.kYCVerification.update).toHaveBeenCalled();
      expect(result.status).toBe('PENDING');
    });
  });
});
