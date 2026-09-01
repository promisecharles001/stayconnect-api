import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationService } from '../common/services/push-notification.service';
import { EarningsService } from '../earnings/earnings.service';
import { createPrismaMock, PrismaMock, bookingRow, propertyRow } from '../test-support/prisma-mock';

/**
 * These cover the money. Every rule here has either cost real money when it
 * was wrong, or is the reason money moves at all:
 *
 *  - a refund used to return less than the visitor paid
 *  - commission decides what a host is owed
 *  - escrow gates stop funds being released twice
 */
describe('BookingsService', () => {
  let service: BookingsService;
  let prisma: PrismaMock;
  let earnings: { addEarning: jest.Mock };

  beforeEach(async () => {
    prisma = createPrismaMock();
    earnings = { addEarning: jest.fn().mockResolvedValue({}) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PushNotificationService, useValue: { sendToUser: jest.fn() } },
        { provide: EarningsService, useValue: earnings },
      ],
    }).compile();

    service = moduleRef.get(BookingsService);
  });

  describe('create', () => {
    const futureDates = {
      startDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      endDate: new Date(Date.now() + 32 * 86400000).toISOString(),
    };

    beforeEach(() => {
      prisma.property.findUnique.mockResolvedValue(propertyRow());
      prisma.booking.findFirst.mockResolvedValue(null);
      prisma.booking.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...bookingRow(), ...data, property: { title: 'Test Property' } }),
      );
    });

    it('takes commission at the property rate', async () => {
      await service.create('visitor-1', {
        propertyId: 'property-1',
        totalAmount: 90000,
        ...futureDates,
      } as any);

      const { data } = prisma.booking.create.mock.calls[0][0];
      // 10% of 90,000. A host is owed the remainder, so this number leaving
      // the service wrong means somebody is paid the wrong amount.
      expect(data.commissionAmount).toBe(9000);
    });

    it('stores a transfer reference derived from the booking id', async () => {
      await service.create('visitor-1', {
        propertyId: 'property-1',
        totalAmount: 50000,
        ...futureDates,
      } as any);

      const { data } = prisma.booking.create.mock.calls[0][0];
      // The visitor puts this in their bank transfer and an admin matches it
      // against the statement — it has to exist at insert, not be derived
      // later by whoever happens to need it.
      expect(data.reference).toBe(`BK-${data.id.slice(0, 8).toUpperCase()}`);
    });

    it('refuses a property that is not approved', async () => {
      prisma.property.findUnique.mockResolvedValue(propertyRow({ status: 'PENDING_APPROVAL' }));

      await expect(
        service.create('visitor-1', {
          propertyId: 'property-1',
          totalAmount: 50000,
          ...futureDates,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a host booking their own property', async () => {
      await expect(
        service.create('host-1', {
          propertyId: 'property-1',
          totalAmount: 50000,
          ...futureDates,
        } as any),
      ).rejects.toThrow(/cannot book your own property/i);
    });

    it('refuses dates that overlap an active booking', async () => {
      prisma.booking.findFirst.mockResolvedValue(bookingRow({ status: 'ACCEPTED' }));

      await expect(
        service.create('visitor-1', {
          propertyId: 'property-1',
          totalAmount: 50000,
          ...futureDates,
        } as any),
      ).rejects.toThrow(/already booked/i);
    });

    it('refuses a start date in the past', async () => {
      await expect(
        service.create('visitor-1', {
          propertyId: 'property-1',
          totalAmount: 50000,
          startDate: new Date(Date.now() - 86400000).toISOString(),
          endDate: new Date(Date.now() + 86400000).toISOString(),
        } as any),
      ).rejects.toThrow(/past/i);
    });
  });

  describe('releaseFunds', () => {
    it('credits the host the total minus commission', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        bookingRow({ escrowStatus: 'HELD', totalAmount: 90000, commissionAmount: 9000 }),
      );
      prisma.booking.update.mockResolvedValue({
        ...bookingRow({ escrowStatus: 'RELEASED' }),
        property: { id: 'property-1', title: 'Test Property', images: [] },
        host: { id: 'host-1', firstName: 'A', lastName: 'B', email: 'a@b.c', phone: null },
      });

      await service.releaseFunds('11111111-1111-4111-8111-111111111111', 'admin-1');

      expect(earnings.addEarning).toHaveBeenCalledWith(
        'host-1',
        81000,
        expect.any(String),
        expect.any(String),
      );
    });

    it('refuses to release unless the money is actually held', async () => {
      prisma.booking.findUnique.mockResolvedValue(bookingRow({ escrowStatus: 'PENDING' }));

      await expect(service.releaseFunds('x', 'admin-1')).rejects.toThrow(/Only HELD/i);
      // The important half: no credit was issued on the failed path.
      expect(earnings.addEarning).not.toHaveBeenCalled();
    });

    it('refuses to release the same booking twice', async () => {
      prisma.booking.findUnique.mockResolvedValue(bookingRow({ escrowStatus: 'RELEASED' }));

      await expect(service.releaseFunds('x', 'admin-1')).rejects.toThrow(/Only HELD/i);
      expect(earnings.addEarning).not.toHaveBeenCalled();
    });
  });

  describe('refundBooking', () => {
    beforeEach(() => {
      prisma.booking.update.mockImplementation(({ data }: any) =>
        Promise.resolve({
          ...bookingRow({ escrowStatus: 'REFUNDED' }),
          ...data,
          property: { id: 'property-1', title: 'Test Property', images: [] },
          host: { id: 'host-1', firstName: 'A', lastName: 'B', email: 'a@b.c', phone: null },
        }),
      );
    });

    it('returns the whole amount the visitor paid', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        bookingRow({ escrowStatus: 'HELD', totalAmount: 50000, commissionAmount: 5000 }),
      );

      await service.refundBooking('x', 'admin-1', {} as any);

      const { data } = prisma.booking.update.mock.calls[0][0];
      // Not 45,000. This subtracted a fee until it was reported, so a
      // refunded visitor quietly received less than they handed over.
      expect(data.refundAmount).toBe(50000);
    });

    it('ignores a feeAmount sent by an older client', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        bookingRow({ escrowStatus: 'HELD', totalAmount: 30000, commissionAmount: 3000 }),
      );

      await service.refundBooking('x', 'admin-1', { feeAmount: 3000 } as any);

      const { data } = prisma.booking.update.mock.calls[0][0];
      // Apps already installed still send this. It must not come off the
      // refund, and it must not be rejected either.
      expect(data.refundAmount).toBe(30000);
    });

    it('refuses to refund money that is not held', async () => {
      prisma.booking.findUnique.mockResolvedValue(bookingRow({ escrowStatus: 'RELEASED' }));

      await expect(service.refundBooking('x', 'admin-1', {} as any)).rejects.toThrow(/Only HELD/i);
    });
  });
});
