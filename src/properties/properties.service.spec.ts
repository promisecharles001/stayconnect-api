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

  // The pin was set once at creation and never touched again on edit — a
  // host correcting a typo'd address, or genuinely moving, left the map
  // showing the property confidently in the wrong place. These run against
  // their own module instance so GOOGLE_MAPS_API_KEY and global fetch can be
  // controlled without affecting the shared `service` used everywhere else
  // in this file.
  describe('update — re-geocoding when the address changes', () => {
    let geoService: PropertiesService;
    let geoPrisma: PrismaMock;
    let originalFetch: typeof fetch;

    beforeEach(async () => {
      geoPrisma = createPrismaMock();
      geoPrisma.property.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...propertyRow(), ...data }),
      );

      const moduleRef = await Test.createTestingModule({
        providers: [
          PropertiesService,
          { provide: PrismaService, useValue: geoPrisma },
          {
            provide: ConfigService,
            useValue: { get: (key: string) => (key === 'GOOGLE_MAPS_API_KEY' ? 'test-key' : undefined) },
          },
          { provide: NotificationService, useValue: { notifyNewPropertySubmitted: jest.fn() } },
        ],
      }).compile();

      geoService = moduleRef.get(PropertiesService);
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    const mockGeocodeSuccess = (lat: number, lng: number) => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ status: 'OK', results: [{ geometry: { location: { lat, lng } } }] }),
      }) as any;
    };

    const mockGeocodeFailure = () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ status: 'ZERO_RESULTS', results: [] }),
      }) as any;
    };

    it('re-geocodes when the address changes', async () => {
      geoPrisma.property.findUnique.mockResolvedValue(propertyRow());
      mockGeocodeSuccess(6.6, 3.3);

      await geoService.update('property-1', 'host-1', 'HOST', { address: '99 New Street' } as any);

      const { data } = geoPrisma.property.update.mock.calls[0][0];
      expect(data.latitude).toBe(6.6);
      expect(data.longitude).toBe(3.3);
    });

    it('clears the pin instead of leaving a stale one when the new address fails to geocode', async () => {
      geoPrisma.property.findUnique.mockResolvedValue(propertyRow({ latitude: 6.4281, longitude: 3.4219 }));
      mockGeocodeFailure();

      await geoService.update('property-1', 'host-1', 'HOST', { city: 'Somewhere Unmappable' } as any);

      const { data } = geoPrisma.property.update.mock.calls[0][0];
      expect(data.latitude).toBeNull();
      expect(data.longitude).toBeNull();
    });

    it('does not re-geocode when the address is unchanged', async () => {
      geoPrisma.property.findUnique.mockResolvedValue(propertyRow());
      mockGeocodeSuccess(0, 0);

      await geoService.update('property-1', 'host-1', 'HOST', { title: 'New title' } as any);

      expect(global.fetch).not.toHaveBeenCalled();
      const { data } = geoPrisma.property.update.mock.calls[0][0];
      expect(data.latitude).toBeUndefined();
      expect(data.longitude).toBeUndefined();
    });

    it('does not re-geocode when the new address is the same as the old one', async () => {
      geoPrisma.property.findUnique.mockResolvedValue(propertyRow({ address: '12 Admiralty Way' }));
      mockGeocodeSuccess(0, 0);

      await geoService.update('property-1', 'host-1', 'HOST', { address: '12 Admiralty Way' } as any);

      expect(global.fetch).not.toHaveBeenCalled();
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

    // Each search word becomes one AND entry holding an OR over the columns.
    const termsOf = (call: any) =>
      call.where.AND.map((entry: any) =>
        entry.OR[0][Object.keys(entry.OR[0])[0]].contains,
      );

    it('searches state and address, not just city', async () => {
      prisma.property.count.mockResolvedValue(0);
      prisma.property.findMany.mockResolvedValue([]);

      await service.findAll({ page: 1, limit: 10, search: 'Lagos' } as any);

      // Cards read "Lekki, Lagos" and the box invites a city or area, so
      // searching the state returning nothing was the likeliest query
      // failing.
      const fields = prisma.property.findMany.mock.calls[0][0].where.AND[0].OR.map(
        (clause: any) => Object.keys(clause)[0],
      );
      expect(fields).toEqual(expect.arrayContaining(['city', 'state', 'address']));
    });

    it('matches a typed phrase word by word, not as one literal string', async () => {
      prisma.property.count.mockResolvedValue(0);
      prisma.property.findMany.mockResolvedValue([]);

      // The tester typed exactly this and got "0 places" while "Abuja"
      // alone returned three, because no column holds the whole phrase.
      await service.findAll({
        page: 1,
        limit: 10,
        search: 'Stays in Abuja',
      } as any);

      expect(termsOf(prisma.property.findMany.mock.calls[0][0])).toEqual(['Abuja']);
    });

    it('requires every meaningful word, so results narrow rather than widen', async () => {
      prisma.property.count.mockResolvedValue(0);
      prisma.property.findMany.mockResolvedValue([]);

      await service.findAll({
        page: 1,
        limit: 10,
        search: 'Studio Apartment Abuja',
      } as any);

      const call = prisma.property.findMany.mock.calls[0][0];
      expect(termsOf(call)).toEqual(['Studio', 'Apartment', 'Abuja']);
      expect(call.where.AND).toHaveLength(3);
    });

    it('keeps property-type words as real search terms', async () => {
      prisma.property.count.mockResolvedValue(0);
      prisma.property.findMany.mockResolvedValue([]);

      // Dropping "apartment" as filler would make this match houses too.
      await service.findAll({
        page: 1,
        limit: 10,
        search: 'apartment in Abuja',
      } as any);

      expect(termsOf(prisma.property.findMany.mock.calls[0][0])).toEqual([
        'apartment',
        'Abuja',
      ]);
    });

    it('falls back to the words typed when the query is all filler', async () => {
      prisma.property.count.mockResolvedValue(0);
      prisma.property.findMany.mockResolvedValue([]);

      // Stripping every word would leave no constraint and return the whole
      // country, which is worse than returning nothing.
      await service.findAll({ page: 1, limit: 10, search: 'a place to stay' } as any);

      const call = prisma.property.findMany.mock.calls[0][0];
      expect(call.where.AND.length).toBeGreaterThan(0);
      expect(termsOf(call)).toEqual(['a', 'place', 'to', 'stay']);
    });

    it('still applies the approved-and-available filter alongside a search', async () => {
      prisma.property.count.mockResolvedValue(0);
      prisma.property.findMany.mockResolvedValue([]);

      await service.findAll({ page: 1, limit: 10, search: 'Stays in Abuja' } as any);

      const { where } = prisma.property.findMany.mock.calls[0][0];
      expect(where.status).toBe('APPROVED');
      expect(where.isAvailable).toBe(true);
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
