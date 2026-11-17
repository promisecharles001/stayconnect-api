import { Test } from '@nestjs/testing';
import { BookingsService } from './bookings.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationService } from '../common/services/push-notification.service';
import { EarningsService } from '../earnings/earnings.service';
import { createPrismaMock, PrismaMock, bookingRow, propertyRow } from '../test-support/prisma-mock';

/**
 * The booking total used to be whatever the client sent, so a visitor could
 * book any property for ₦1. The server now prices the stay itself.
 */
describe('BookingsService.create pricing', () => {
  let service: BookingsService;
  let prisma: PrismaMock;

  const DAY = 86_400_000;
  const dates = (fromDays: number, nights: number) => ({
    startDate: new Date(Date.now() + fromDays * DAY).toISOString(),
    endDate: new Date(Date.now() + (fromDays + nights) * DAY).toISOString(),
  });

  beforeEach(async () => {
    prisma = createPrismaMock();
    prisma.property.findUnique.mockResolvedValue(
      propertyRow({ basePricePerNight: 25000, commissionPercent: 10 }),
    );
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.booking.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...bookingRow(), ...data, property: { title: 'Test Property' } }),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PushNotificationService, useValue: { sendToUser: jest.fn() } },
        { provide: EarningsService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(BookingsService);
  });

  const stored = () => prisma.booking.create.mock.calls[0][0].data;

  it('ignores a client-sent total and charges nightly price x nights', async () => {
    await service.create('visitor-1', {
      propertyId: 'property-1',
      totalAmount: 1,
      ...dates(30, 3),
    } as any);

    expect(stored().totalAmount).toBe(75000);
    expect(stored().commissionAmount).toBe(7500);
  });

  it('counts calendar nights, so a stray time of day cannot add a night', async () => {
    await service.create('visitor-1', {
      propertyId: 'property-1',
      startDate: '2099-03-01T00:00:00.000Z',
      endDate: '2099-03-04T00:00:00.001Z',
    } as any);

    expect(stored().totalAmount).toBe(75000);
  });

  it('refuses a stay shorter than one night instead of charging ₦0', async () => {
    await expect(
      service.create('visitor-1', {
        propertyId: 'property-1',
        startDate: '2099-03-01T08:00:00.000Z',
        endDate: '2099-03-01T20:00:00.000Z',
      } as any),
    ).rejects.toThrow('at least one night');
  });

  it('works for app versions that no longer send a total', async () => {
    await service.create('visitor-1', { propertyId: 'property-1', ...dates(30, 1) } as any);

    expect(stored().totalAmount).toBe(25000);
  });
});
