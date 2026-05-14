import { PrismaClient, UserStatus, KYCStatus, PropertyStatus, PropertyType, BookingStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // ─── Create Roles (idempotent) ───────────────────────────────────────────
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: {
      name: 'ADMIN',
      description: 'System Administrator with full access',
      permissions: ['*'],
    },
  });

  const hostRole = await prisma.role.upsert({
    where: { name: 'HOST' },
    update: {},
    create: {
      name: 'HOST',
      description: 'Property Host can list and manage properties',
      permissions: ['properties:read', 'properties:write', 'bookings:read', 'earnings:read', 'withdrawals:write'],
    },
  });

  const guestRole = await prisma.role.upsert({
    where: { name: 'GUEST' },
    update: {},
    create: {
      name: 'GUEST',
      description: 'Guest can search and book properties',
      permissions: ['properties:read', 'bookings:write'],
    },
  });

  console.log('👥 Roles ready: ADMIN, HOST, GUEST');

  // ─── Create Admin User (idempotent) ──────────────────────────────────────
  const adminPassword = await bcrypt.hash('Admin@123456', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@stayconnect.ng' },
    update: {},
    create: {
      email: 'admin@stayconnect.ng',
      password: adminPassword,
      firstName: 'System',
      lastName: 'Administrator',
      phone: '+2348011111111',
      roleId: adminRole.id,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      phoneVerified: true,
    },
  });
  console.log('👤 Admin user ready:', admin.email);

  // ─── Create Sample Host (only if not exists) ─────────────────────────────
  const hostPassword = await bcrypt.hash('Host@123456', 12);
  const host = await prisma.user.upsert({
    where: { email: 'host@example.com' },
    update: {},
    create: {
      email: 'host@example.com',
      password: hostPassword,
      firstName: 'John',
      lastName: 'Host',
      phone: '+2348022222222',
      roleId: hostRole.id,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      phoneVerified: true,
      hostSince: new Date(),
      hostBio: 'Experienced host with premium properties in Lagos',
    },
  });
  console.log('👤 Host user ready:', host.email);

  // ─── Create Sample Guest (only if not exists) ────────────────────────────
  const guestPassword = await bcrypt.hash('Guest@123456', 12);
  const guest = await prisma.user.upsert({
    where: { email: 'guest@example.com' },
    update: {},
    create: {
      email: 'guest@example.com',
      password: guestPassword,
      firstName: 'Jane',
      lastName: 'Guest',
      phone: '+2348033333333',
      roleId: guestRole.id,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      phoneVerified: true,
    },
  });
  console.log('👤 Guest user ready:', guest.email);

  // ─── Sample Data (only create if host has no properties yet) ─────────────
  const existingHostProperties = await prisma.property.count({
    where: { hostId: host.id },
  });

  if (existingHostProperties === 0) {
    // Create KYC for Host
    await prisma.kYCVerification.create({
      data: {
        userId: host.id,
        documentType: 'DRIVERS_LICENSE',
        documentNumber: 'ABC123456789',
        documentImageFront: 'https://example.com/kyc/host-license-front.jpg',
        documentImageBack: 'https://example.com/kyc/host-license-back.jpg',
        dateOfBirth: new Date('1985-05-15'),
        address: '123 Host Street',
        city: 'Lekki',
        state: 'Lagos State',
        country: 'Nigeria',
        status: KYCStatus.APPROVED,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
        reviewNotes: 'Documents verified successfully',
        selfieImage: 'https://example.com/kyc/host-selfie.jpg',
        selfieVerified: true,
      },
    });
    console.log('✅ Created KYC for host');

    // Create Sample Properties
    const property1 = await prisma.property.create({
      data: {
        hostId: host.id,
        title: 'Luxury Apartment in Lekki Phase 1',
        description: 'Beautiful 3-bedroom luxury apartment with ocean view, swimming pool, and 24/7 power supply. Located in the heart of Lekki Phase 1 with easy access to restaurants and shopping centers.',
        propertyType: PropertyType.APARTMENT,
        address: '15 Admiralty Way',
        city: 'Lekki',
        state: 'Lagos State',
        country: 'Nigeria',
        postalCode: '106104',
        latitude: 6.4474,
        longitude: 3.4713,
        maxGuests: 6,
        bedrooms: 3,
        beds: 4,
        bathrooms: 3.5,
        amenities: ['WiFi', 'Swimming Pool', 'Air Conditioning', 'Parking', 'Security', 'Generator', 'Smart TV', 'Kitchen'],
        houseRules: 'No smoking inside. No parties or events. Check-in after 2 PM, check-out before 11 AM.',
        checkInTime: '14:00',
        checkOutTime: '11:00',
        basePricePerNight: 75000.00,
        cleaningFee: 5000.00,
        commissionPercent: 10.00,
        status: PropertyStatus.APPROVED,
        isInstantBook: true,
        minNights: 2,
        maxNights: 30,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
        reviewNotes: 'Property verified and approved',
        publishedAt: new Date(),
        images: [
          'https://example.com/properties/prop1-1.jpg',
          'https://example.com/properties/prop1-2.jpg',
          'https://example.com/properties/prop1-3.jpg',
        ],
      },
    });
    console.log('🏠 Created property:', property1.title);

    const property2 = await prisma.property.create({
      data: {
        hostId: host.id,
        title: 'Cozy Studio in Ikoyi',
        description: 'Modern studio apartment perfect for business travelers. Fully furnished with high-speed internet and workspace.',
        propertyType: PropertyType.STUDIO,
        address: '8 Bourdillon Road',
        city: 'Ikoyi',
        state: 'Lagos State',
        country: 'Nigeria',
        latitude: 6.4478,
        longitude: 3.4256,
        maxGuests: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        amenities: ['WiFi', 'Air Conditioning', 'Workspace', 'Kitchenette', 'Gym Access'],
        houseRules: 'No pets allowed. Quiet hours after 10 PM.',
        checkInTime: '15:00',
        checkOutTime: '12:00',
        basePricePerNight: 35000.00,
        cleaningFee: 3000.00,
        commissionPercent: 10.00,
        status: PropertyStatus.APPROVED,
        isInstantBook: false,
        minNights: 1,
        maxNights: 14,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
        reviewNotes: 'Approved',
        publishedAt: new Date(),
        images: [
          'https://example.com/properties/prop2-1.jpg',
          'https://example.com/properties/prop2-2.jpg',
        ],
      },
    });
    console.log('🏠 Created property:', property2.title);

    const property3 = await prisma.property.create({
      data: {
        hostId: host.id,
        title: 'Beachfront Villa in Eko Atlantic',
        description: 'Stunning 5-bedroom beachfront villa with private pool and direct beach access. Perfect for family vacations and events.',
        propertyType: PropertyType.VILLA,
        address: 'Eko Atlantic City',
        city: 'Victoria Island',
        state: 'Lagos State',
        country: 'Nigeria',
        latitude: 6.4167,
        longitude: 3.4167,
        maxGuests: 12,
        bedrooms: 5,
        beds: 7,
        bathrooms: 6,
        amenities: ['WiFi', 'Private Pool', 'Beach Access', 'Air Conditioning', 'Parking', 'Security', 'BBQ Area', 'Garden'],
        houseRules: 'Events allowed with prior approval. Security deposit required.',
        checkInTime: '14:00',
        checkOutTime: '11:00',
        basePricePerNight: 150000.00,
        cleaningFee: 15000.00,
        commissionPercent: 10.00,
        status: PropertyStatus.PENDING_APPROVAL,
        isInstantBook: false,
        minNights: 3,
        maxNights: 14,
        images: [
          'https://example.com/properties/prop3-1.jpg',
          'https://example.com/properties/prop3-2.jpg',
        ],
      },
    });
    console.log('🏠 Created property:', property3.title);

    // Create a sample booking
    await prisma.booking.create({
      data: {
        guestId: guest.id,
        hostId: host.id,
        propertyId: property1.id,
        startDate: new Date('2024-03-01'),
        endDate: new Date('2024-03-05'),
        totalAmount: 300000.00,
        commissionAmount: 30000.00,
        status: BookingStatus.PENDING,
      },
    });
    console.log('📅 Created sample booking');
  } else {
    console.log('⏭️  Sample data already exists, skipping property/booking creation');
  }

  console.log('\n✅ Database seed completed successfully!');
  console.log('\n📧 Default login credentials:');
  console.log('   Admin: admin@stayconnect.ng / Admin@123456');
  console.log('   Host:  host@example.com / Host@123456');
  console.log('   Guest: guest@example.com / Guest@123456');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
