import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PropertyStatus } from '@prisma/client';
import { NotificationService } from '../common/services/notification.service';
import { PaginationUtil, PaginatedResult } from '../common/utils/pagination.util';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { QueryPropertiesDto } from './dto/query-properties.dto';
import { PropertyResponseDto } from './dto/property-response.dto';
import Decimal from 'decimal.js';

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
  ) {}

  private async geocodeAddress(address: string, city: string, state: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const apiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY');
      if (!apiKey) {
        this.logger.warn('GOOGLE_MAPS_API_KEY not configured, skipping geocoding');
        return null;
      }

      const fullAddress = `${address}, ${city}, ${state}, Nigeria`;
      const encodedAddress = encodeURIComponent(fullAddress);
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.results.length > 0) {
        const location = data.results[0].geometry.location;
        this.logger.log(`Geocoded address: ${fullAddress} -> ${location.lat}, ${location.lng}`);
        return { lat: location.lat, lng: location.lng };
      }

      this.logger.warn(`Geocoding failed for: ${fullAddress} — status: ${data.status}`);
      return null;
    } catch (error) {
      this.logger.error('Geocoding error:', error);
      return null;
    }
  }

  async create(hostId: string, createPropertyDto: CreatePropertyDto): Promise<PropertyResponseDto> {
    // Check if host exists and is approved
    const host = await this.prisma.user.findUnique({
      where: { id: hostId },
      include: { kycVerification: true },
    });

    if (!host) {
      throw new NotFoundException('Host not found');
    }

    // Check if host has approved KYC
    if (!host.kycVerification || host.kycVerification.status !== 'APPROVED') {
      throw new ForbiddenException('Host KYC verification is required before listing properties. Please complete your verification first.');
    }

    // Geocode address for map search
    const coords = await this.geocodeAddress(
      createPropertyDto.address,
      createPropertyDto.city,
      createPropertyDto.state,
    );

    // Create property
    const property = await this.prisma.property.create({
      data: {
        ...createPropertyDto,
        hostId,
        status: PropertyStatus.PENDING_APPROVAL,
        basePricePerNight: new Decimal(createPropertyDto.basePricePerNight.toString()),
        cleaningFee: createPropertyDto.cleaningFee ? new Decimal(createPropertyDto.cleaningFee.toString()) : null,
        images: createPropertyDto.images || [],
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      },
    });

    this.logger.log(`Property created: ${property.title} by host: ${host.email}`);

    // Notify admin
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL') || 'stayconnectng@gmail.com';
    await this.notificationService.notifyNewPropertySubmitted(
      adminEmail,
      property.title,
      `${host.firstName} ${host.lastName}`,
      host.email,
    );

    // Convert Decimal values to numbers for the response
    return {
      ...property,
      basePricePerNight: Number(property.basePricePerNight),
      cleaningFee: property.cleaningFee ? Number(property.cleaningFee) : null,
      commissionPercent: Number(property.commissionPercent),
      averageRating: property.averageRating ?? 0,
    } as unknown as PropertyResponseDto;
  }

  async findAll(query: QueryPropertiesDto): Promise<PaginatedResult<PropertyResponseDto>> {
    const {
      search,
      propertyType,
      status,
      city,
      state,
      minPrice,
      maxPrice,
      guests,
      page,
      limit,
    } = query;

    const { skip, take } = {
      skip: PaginationUtil.calculateSkip({ page, limit }),
      take: limit,
    };

    // Build where clause
    const where: any = {};

    // Only show approved properties for public search, and only ones the
    // host currently has on the market. A host toggling availability off
    // takes the listing out of search without touching its moderation state.
    where.status = status || PropertyStatus.APPROVED;
    where.isAvailable = true;

    if (search) {
      // Matched as one literal string, "Stays in Abuja" found nothing while
      // "Abuja" found three — because no single column contains the whole
      // phrase. People type sentences into a search box, so split the query
      // and require each meaningful word to appear somewhere on the listing.
      //
      // state and address are in the field list because listings render as
      // "Lekki, Lagos" and searching the state is how people search in
      // Nigeria; matching only title/description/city returned nothing for
      // areas that clearly had listings.
      const fieldsFor = (term: string) => [
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { city: { contains: term, mode: 'insensitive' } },
        { state: { contains: term, mode: 'insensitive' } },
        { address: { contains: term, mode: 'insensitive' } },
      ];

      // Filler words carry no meaning here and would match almost every
      // description, so dropping them keeps results tight rather than
      // returning everything for "a place in Lagos".
      // Grammatical filler and generic words for "somewhere to sleep" only.
      // Deliberately NOT apartment/house/studio/room: those are real search
      // terms that appear in listing titles, and dropping them would make
      // "apartment in Abuja" return every house in Abuja too.
      const STOP_WORDS = new Set([
        'in', 'at', 'on', 'the', 'a', 'an', 'of', 'for', 'to', 'near',
        'me', 'my', 'and', 'or', 'with', 'find', 'show', 'search',
        'stay', 'stays', 'staying', 'place', 'places', 'available',
      ]);

      const words = search
        .split(/[\s,]+/)
        .map((w) => w.trim())
        .filter(Boolean);

      const terms = words.filter((w) => !STOP_WORDS.has(w.toLowerCase()));

      // If the query was nothing but filler ("a place to stay"), fall back to
      // the words as typed rather than matching every listing in the country.
      const effective = terms.length > 0 ? terms : words;

      // AND across words, OR across columns: "2 bedroom Lekki" should mean
      // both, not either. A single-word query behaves exactly as before.
      where.AND = effective.map((term) => ({ OR: fieldsFor(term) }));
    }

    if (propertyType) {
      where.propertyType = propertyType;
    }

    if (city) {
      where.city = { contains: city, mode: 'insensitive' };
    }

    if (state) {
      where.state = { contains: state, mode: 'insensitive' };
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.basePricePerNight = {};
      if (minPrice !== undefined) {
        where.basePricePerNight.gte = minPrice;
      }
      if (maxPrice !== undefined) {
        where.basePricePerNight.lte = maxPrice;
      }
    }

    if (guests) {
      where.maxGuests = { gte: guests };
    }

    // Get total count
    const total = await this.prisma.property.count({ where });

    // Get properties
    const properties = await this.prisma.property.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        host: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            hostRating: true,
            hostReviewCount: true,
          },
        },
      },
    });

    // Convert Decimal values to numbers for the response
    const convertedProperties = properties.map(property => ({
      ...property,
      basePricePerNight: Number(property.basePricePerNight),
      cleaningFee: property.cleaningFee ? Number(property.cleaningFee) : null,
      commissionPercent: Number(property.commissionPercent),
      averageRating: property.averageRating ?? 0,
      host: {
        ...property.host,
        hostRating: property.host.hostRating ?? 0,
        hostReviewCount: property.host.hostReviewCount ?? 0,
      },
    }));

    return PaginationUtil.createResult(convertedProperties as PropertyResponseDto[], total, { page, limit });
  }

  async findAllAdmin(query: QueryPropertiesDto): Promise<PaginatedResult<PropertyResponseDto>> {
    const { page, limit, status } = query;
    const { skip, take } = {
      skip: PaginationUtil.calculateSkip({ page, limit }),
      take: limit,
    };

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [properties, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          host: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.property.count({ where }),
    ]);

    const convertedProperties = properties.map(property => ({
      ...property,
      basePricePerNight: Number(property.basePricePerNight),
      cleaningFee: property.cleaningFee ? Number(property.cleaningFee) : null,
      commissionPercent: Number(property.commissionPercent),
      averageRating: property.averageRating ?? 0,
      host: {
        ...property.host,
        hostRating: 0,
        hostReviewCount: 0,
      },
    }));

    return PaginationUtil.createResult(convertedProperties as PropertyResponseDto[], total, { page, limit });
  }

  async findByHost(hostId: string, query: QueryPropertiesDto): Promise<PaginatedResult<PropertyResponseDto>> {
    const { page, limit } = query;
    const { skip, take } = {
      skip: PaginationUtil.calculateSkip({ page, limit }),
      take: limit,
    };

    const [properties, total] = await Promise.all([
      this.prisma.property.findMany({
        where: { hostId },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.property.count({ where: { hostId } }),
    ]);

    // Convert Decimal values to numbers for the response
    const convertedProperties = properties.map(property => ({
      ...property,
      basePricePerNight: Number(property.basePricePerNight),
      cleaningFee: property.cleaningFee ? Number(property.cleaningFee) : null,
      commissionPercent: Number(property.commissionPercent),
      averageRating: property.averageRating ?? 0,
    }));

    return PaginationUtil.createResult(convertedProperties as PropertyResponseDto[], total, { page, limit });
  }

  async findOne(id: string): Promise<PropertyResponseDto> {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        // phone is here so a visitor looking at a listing can reach the host
        // directly for anything the listing doesn't answer, same as the
        // in-app voice call already does — this just gives them the number
        // itself. Only findOne selects it: the endpoint behind property
        // details, which already requires a signed-in account, not the
        // public list or search, where it would go out to every browsing
        // session at once.
        host: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            // The details screen has always rendered host.email and the
            // Contact sheet offers an "Email host" option, but this select
            // never returned it — so the email line rendered blank and the
            // Contact option read "Email undefined" and opened
            // mailto:undefined.
            email: true,
            avatarUrl: true,
            hostRating: true,
            hostReviewCount: true,
            hostSince: true,
          },
        },
      },
    });

    if (!property) {
      throw new NotFoundException(`Property with ID '${id}' not found`);
    }

    // Convert Decimal values to numbers for the response
    return {
      ...property,
      basePricePerNight: Number(property.basePricePerNight),
      cleaningFee: property.cleaningFee ? Number(property.cleaningFee) : null,
      commissionPercent: Number(property.commissionPercent),
      averageRating: property.averageRating ?? 0,
      host: {
        ...property.host,
        hostRating: property.host.hostRating ?? 0,
        hostReviewCount: property.host.hostReviewCount ?? 0,
        hostSince: property.host.hostSince,
      },
    } as unknown as PropertyResponseDto;
  }

  /**
   * Take a listing off the market, or put it back.
   *
   * Separate from update() on purpose: this is the one property field a host
   * is allowed to flip freely, and routing it through the general update
   * would drag it into the moderation rules — editing an approved listing
   * sends it back for review, which is not what "I'm booked up this week"
   * should do.
   */
  async setAvailability(
    id: string,
    userId: string,
    userRole: string,
    isAvailable: boolean,
  ): Promise<PropertyResponseDto> {
    const property = await this.prisma.property.findUnique({ where: { id } });

    if (!property) {
      throw new NotFoundException(`Property with ID '${id}' not found`);
    }

    if (property.hostId !== userId && !userRole.includes('ADMIN')) {
      throw new ForbiddenException('You do not have permission to update this property');
    }

    const updated = await this.prisma.property.update({
      where: { id },
      data: { isAvailable },
    });

    this.logger.log(`Property ${id} availability set to ${isAvailable}`);

    return {
      ...updated,
      basePricePerNight: Number(updated.basePricePerNight),
      cleaningFee: updated.cleaningFee ? Number(updated.cleaningFee) : null,
      commissionPercent: Number(updated.commissionPercent),
      averageRating: updated.averageRating ?? 0,
    } as unknown as PropertyResponseDto;
  }

  async update(
    id: string,
    hostId: string,
    hostRole: string,
    updatePropertyDto: UpdatePropertyDto,
  ): Promise<PropertyResponseDto> {
    const property = await this.prisma.property.findUnique({
      where: { id },
    });

    if (!property) {
      throw new NotFoundException(`Property with ID '${id}' not found`);
    }

    // Check permission
    if (property.hostId !== hostId && !hostRole.includes('ADMIN')) {
      throw new ForbiddenException('You do not have permission to update this property');
    }

    // `status` is a moderation decision and belongs to admins only.
    //
    // This used to only intervene when the property was ALREADY approved,
    // which left the gap wide open: a host could PATCH status:'APPROVED'
    // onto their own PENDING_APPROVAL listing and it went live, publicly
    // searchable, without anyone reviewing it. The same trick brought back a
    // listing an admin had REJECTED or SUSPENDED. Verified against
    // production before fixing.
    //
    // Non-admins never get to set it. Editing an approved listing still
    // sends it back for re-review, which was the original intent.
    if (!hostRole.includes('ADMIN')) {
      delete updatePropertyDto.status;

      if (property.status === PropertyStatus.APPROVED) {
        updatePropertyDto.status = PropertyStatus.PENDING_APPROVAL;
      }
    }

    // The pin is set once at creation and was never touched again — editing
    // the address (fixing a typo, or an actual move) left latitude/longitude
    // pointing at wherever the ORIGINAL text geocoded to. That is worse than
    // having no pin: the property still shows up on the map, confidently, in
    // the wrong place, with nothing telling the host or a visitor this
    // happened. Only re-geocode when address/city/state actually changed —
    // most edits (price, description, photos) don't touch location and
    // shouldn't spend an API call on it.
    const addressChanged =
      (updatePropertyDto.address !== undefined && updatePropertyDto.address !== property.address) ||
      (updatePropertyDto.city !== undefined && updatePropertyDto.city !== property.city) ||
      (updatePropertyDto.state !== undefined && updatePropertyDto.state !== property.state);

    let coordsUpdate: { latitude: number | null; longitude: number | null } | undefined;
    if (addressChanged) {
      const coords = await this.geocodeAddress(
        updatePropertyDto.address ?? property.address,
        updatePropertyDto.city ?? property.city,
        updatePropertyDto.state ?? property.state,
      );
      // A failed geocode clears the pin rather than leaving the stale one —
      // same reasoning as above, an admittedly-unknown location beats a
      // confidently wrong one.
      coordsUpdate = { latitude: coords?.lat ?? null, longitude: coords?.lng ?? null };
    }

    const updatedProperty = await this.prisma.property.update({
      where: { id },
      data: coordsUpdate ? { ...updatePropertyDto, ...coordsUpdate } : updatePropertyDto,
    });

    this.logger.log(`Property updated: ${updatedProperty.title}`);

    // Convert Decimal values to numbers for the response
    return {
      ...updatedProperty,
      basePricePerNight: Number(updatedProperty.basePricePerNight),
      cleaningFee: updatedProperty.cleaningFee ? Number(updatedProperty.cleaningFee) : null,
      commissionPercent: Number(updatedProperty.commissionPercent),
      averageRating: updatedProperty.averageRating ?? 0,
    } as unknown as PropertyResponseDto;
  }

  async remove(id: string, hostId: string, hostRole: string): Promise<void> {
    const property = await this.prisma.property.findUnique({
      where: { id },
    });

    if (!property) {
      throw new NotFoundException(`Property with ID '${id}' not found`);
    }

    // Check permission
    if (property.hostId !== hostId && !hostRole.includes('ADMIN')) {
      throw new ForbiddenException('You do not have permission to delete this property');
    }

    // Bookings reference the property without a cascade, on purpose — a
    // stay that happened is financial history and shouldn't vanish because
    // the listing was taken down. Postgres blocks the delete, which came
    // back as a 500 carrying the raw Prisma error. Say what's actually
    // wrong, and point at the action that does what they meant.
    const bookings = await this.prisma.booking.count({ where: { propertyId: id } });
    if (bookings > 0) {
      throw new ConflictException(
        `This listing can't be deleted because it has ${bookings} booking(s) against it. ` +
          `Set its status to INACTIVE or SUSPENDED to take it off the site while keeping the booking history.`,
      );
    }

    await this.prisma.property.delete({
      where: { id },
    });

    this.logger.log(`Property deleted: ${property.title}`);
  }

  async reviewProperty(
    id: string,
    adminId: string,
    status: PropertyStatus,
    reviewNotes?: string,
    rejectionReason?: string,
  ): Promise<PropertyResponseDto> {
    const property = await this.prisma.property.findUnique({
      where: { id },
    });

    if (!property) {
      throw new NotFoundException(`Property with ID '${id}' not found`);
    }

    const updateData: any = {
      status,
      reviewedBy: adminId,
      reviewedAt: new Date(),
      reviewNotes,
    };

    if (status === PropertyStatus.APPROVED) {
      updateData.publishedAt = new Date();
    }

    if (status === PropertyStatus.REJECTED) {
      updateData.rejectionReason = rejectionReason;
    }

    const updatedProperty = await this.prisma.property.update({
      where: { id },
      data: updateData,
    });

    this.logger.log(`Property ${status}: ${updatedProperty.title}`);

    // Convert Decimal values to numbers for the response
    return {
      ...updatedProperty,
      basePricePerNight: Number(updatedProperty.basePricePerNight),
      cleaningFee: updatedProperty.cleaningFee ? Number(updatedProperty.cleaningFee) : null,
      commissionPercent: Number(updatedProperty.commissionPercent),
      averageRating: updatedProperty.averageRating ?? 0,
    } as unknown as PropertyResponseDto;
  }

  async getPropertyStats(id: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            bookings: true,
          },
        },
        bookings: {
          where: {
            status: {
              in: ['ACCEPTED', 'COMPLETED'],
            },
          },
          select: {
            totalAmount: true,
          },
        },
      },
    });

    if (!property) {
      throw new NotFoundException(`Property with ID '${id}' not found`);
    }

    const totalRevenue = property.bookings.reduce(
      (sum, booking) => sum + Number(booking.totalAmount),
      0,
    );

    return {
      propertyId: id,
      totalBookings: property._count.bookings,
      totalRevenue,
      averageRating: property.averageRating,
      reviewCount: property.reviewCount,
    };
  }
}
