import { PrismaClient, UserStatus } from '@prisma/client';
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
    where: { name: 'VISITOR' },
    update: {},
    create: {
      name: 'VISITOR',
      description: 'Guest can search and book properties',
      permissions: ['properties:read', 'bookings:write'],
    },
  });

  console.log('👥 Roles ready: ADMIN, HOST, VISITOR');

  // ─── Create Admin User (idempotent — password ALWAYS updated on re-seed) ──
  // Production: set DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD in Render dashboard.
  // Local dev defaults: admin@stayconnect.ng / Admin@123456
  const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@stayconnect.ng';
  const rawAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123456';
  const adminPassword = await bcrypt.hash(rawAdminPassword, 12);

  // Use update (not upsert update:{}) so a password change in env vars
  // takes effect next deploy without manually touching the database.
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { password: adminPassword, status: UserStatus.ACTIVE },
    create: {
      email: adminEmail,
      password: adminPassword,
      firstName: 'System',
      lastName: 'Administrator',
      phone: process.env.ADMIN_PHONE || '+2348011111111',
      roleId: adminRole.id,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      phoneVerified: true,
    },
  });
  console.log('👤 Admin user ready:', admin.email);

  // Deliberately no demo host/guest/property/booking data — this seed runs
  // on every production deploy (render.yaml), so anything created here
  // shows up as real listings to real users. Roles + admin account only.

  // Backfill transfer references for bookings made before the column
  // existed. This lives here rather than in a migration because the deploy
  // runs `prisma db push`, which skips migration files entirely — so this
  // step is the only thing that will actually run against production.
  //
  // The expression matches what the client used to derive on the fly,
  // 'BK-' + first 8 characters of the id, uppercased. Visitors have already
  // been given those codes for transfers that may not be reconciled yet, so
  // they have to keep resolving to the same booking.
  const unreferenced = await prisma.booking.findMany({
    where: { reference: null },
    select: { id: true },
  });

  if (unreferenced.length > 0) {
    for (const booking of unreferenced) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { reference: `BK-${booking.id.slice(0, 8).toUpperCase()}` },
      });
    }
    console.log(`🔖 Backfilled ${unreferenced.length} booking reference(s)`);
  }

  console.log('\n✅ Database seed completed successfully!');
  console.log('\n📧 Admin account:', adminEmail, '(password from DEFAULT_ADMIN_PASSWORD env var)');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
