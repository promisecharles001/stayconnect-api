import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, ConflictException } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../common/services/notification.service';
import { createPrismaMock, PrismaMock, propertyRow } from '../test-support/prisma-mock';

/**
 * Moderation is the reason a listing can be trusted, and it was bypassable in
 * production: a host could PATCH status:'APPROVED' onto their own listing and
 * it went live, publicly searchable, with nobody reviewing it. The same move
 * revived listings an admin had rejected or suspended.
 *
 * Everything in the first block exists so that cannot come back.
 */
describe('PropertiesService', () => {
  let service: PropertiesService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = createPrismaMock();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PropertiesService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: NotificationService, useValue: { notifyNewPropertySubmitted: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(PropertiesService);
  });

  describe('update — who may set status', () => {
    beforeEach(() => {
      prisma.property.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...propertyRow(), ...data }),
      );
    });

    it('ignores a host trying to approve their own pending listing', async () => {
      prisma.property.findUnique.mockResolvedValue(propertyRow({ status: 'PENDING_APPROVAL' }));

      await service.update('property-1', 'host-1', 'HOST', { status: 'APPROVED' } as any);

      const { data } = prisma.property.update.mock.calls[0][0];
      expect(data.status).toBeUndefined();
    });

    it('ignores a host trying to revive a rejected listing', async () => {
      prisma.property.findUnique.mockResolvedValue(propertyRow({ status: 'REJECTED' }));

      await service.update('property-1', 'host-1', 'HOST', { status: 'APPROVED' } as any);

      const { data } = prisma.property.update.mock.calls[0][0];
      expect(data.status).toBeUndefined();
    });

    it('ignores a host trying to un-suspend a listing an admin took down', async () => {
      prisma.property.findUnique.mockResolvedValue(propertyRow({ status: 'SUSPENDED' }));

      await service.update('property-1', 'host-1', 'HOST', { status: 'APPROVED' } as any);

      const { data } = prisma.property.update.mock.calls[0][0];
      expect(data.status).toBeUndefined();
    });

    it('sends an approved listing back for review when its host edits it', async () => {
      prisma.property.findUnique.mockResolvedValue(propertyRow({ status: 'APPROVED' }));

      await service.update('property-1', 'host-1', 'HOST', { title: 'New title' } as any);

      const { data } = prisma.property.update.mock.calls[0][0];
      expect(data.status).toBe('PENDING_APPROVAL');
    });

    it('lets an admin set status', async () => {
      prisma.property.findUnique.mockResolvedValue(propertyRow({ status: 'PENDING_APPROVAL' }));

      await service.update('property-1', 'admin-1', 'ADMIN', { status: 'APPROVED' } as any);

      const { data } = prisma.property.update.mock.calls[0][0];
      expect(data.status).toBe('APPROVED');
    });

    it('refuses an unrelated host entirely', async () => {
      prisma.property.findUnique.mockResolvedValue(propertyRow({ hostId: 'someone-else' }));

      await expect(
        service.update('property-1', 'host-1', 'HOST', { title: 'x' } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('setAvailability', () => {
    beforeEach(() => {
      prisma.property.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...propertyRow(), ...data }),
      );
    });

    it('lets a host take their own listing off the market', async () => {
      prisma.property.findUnique.mockResolvedValue(propertyRow());

      await service.setAvailability('property-1', 'host-1', 'HOST', false);

      const { data } = prisma.property.update.mock.calls[0][0];
      expect(data).toEqual({ isAvailable: false });
    });

    it('never changes moderation status', async () => {
      prisma.property.findUnique.mockResolvedValue(propertyRow({ status: 'PENDING_APPROVAL' }));

      await service.setAvailability('property-1', 'host-1', 'HOST', true);

      // The whole reason availability is its own field: toggling it must not
      // become a second route to approving a listing.
      const { data } = prisma.property.update.mock.calls[0][0];
      expect(data.status).toBeUndefined();
    });

    it("refuses to touch someone else's listing", async () => {
      prisma.property.findUnique.mockResolvedValue(propertyRow({ hostId: 'someone-else' }));

      await expect(
        service.setAvailability('property-1', 'host-1', 'HOST', false),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll — what the public can see', () => {
    it('returns only approved listings that are on the market', async () => {
      prisma.property.count.mockResolvedValue(0);
      prisma.property.findMany.mockResolvedValue([]);

      await service.findAll({ page: 1, limit: 10 } as any);

      const { where } = prisma.property.findMany.mock.calls[0][0];
      expect(where.status).toBe('APPROVED');
      expect(where.isAvailable).toBe(true);
    });

    it('searches state and address, not just city', async () => {
      prisma.property.count.mockResolvedValue(0);
      prisma.property.findMany.mockResolvedValue([]);

      await service.findAll({ page: 1, limit: 10, search: 'Lagos' } as any);

      // Cards read "Lekki, Lagos" and the box invites a city or area, so
      // searching the state returning nothing was the likeliest query
      // failing.
      const fields = prisma.property.findMany.mock.calls[0][0].where.OR.map(
        (clause: any) => Object.keys(clause)[0],
      );
      expect(fields).toEqual(expect.arrayContaining(['city', 'state', 'address']));
    });
  });

  describe('remove', () => {
    it('refuses to delete a listing that has bookings', async () => {
      prisma.property.findUnique.mockResolvedValue(propertyRow());
      prisma.booking.count.mockResolvedValue(3);

      await expect(service.remove('property-1', 'host-1', 'HOST')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.property.delete).not.toHaveBeenCalled();
    });

    it('deletes a listing nothing references', async () => {
      prisma.property.findUnique.mockResolvedValue(propertyRow());
      prisma.booking.count.mockResolvedValue(0);

      await service.remove('property-1', 'host-1', 'HOST');

      expect(prisma.property.delete).toHaveBeenCalled();
    });
  });
});
