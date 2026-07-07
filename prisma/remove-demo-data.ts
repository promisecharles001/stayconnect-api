/**
 * One-time cleanup: removes the demo host/guest/property/booking data that
 * prisma/seed.ts used to create on every deploy (fixed — see seed.ts). This
 * data is identified by the exact demo emails, so it will never touch a
 * real user's account.
 *
 * Run this ONCE against production:
 *   DATABASE_URL="<your production connection string>" npx ts-node prisma/remove-demo-data.ts
 *
 * It only deletes:
 *   - The user host@example.com and everything that references them
 *     (their properties, KYC verification, bookings, conversations)
 *   - The user guest@example.com and their bookings/conversations
 *
 * It does NOT touch the admin account, roles, or any other user/property.
 * Safe to run more than once — it's a no-op if the demo accounts are
 * already gone.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const host = await prisma.user.findUnique({ where: { email: 'host@example.com' } });
  const guest = await prisma.user.findUnique({ where: { email: 'guest@example.com' } });

  if (!host && !guest) {
    console.log('No demo accounts found — nothing to clean up.');
    return;
  }

  if (host) {
    const properties = await prisma.property.findMany({ where: { hostId: host.id }, select: { id: true, title: true } });
    console.log(`Found demo host "${host.email}" with ${properties.length} propert${properties.length === 1 ? 'y' : 'ies'}:`);
    for (const p of properties) console.log(`  - ${p.title}`);

    // Children first (no cascading FK from bookings/property -> user in schema).
    await prisma.booking.deleteMany({ where: { hostId: host.id } });
    await prisma.review.deleteMany({ where: { property: { hostId: host.id } } });
    await prisma.conversation.deleteMany({ where: { hostId: host.id } });
    await prisma.property.deleteMany({ where: { hostId: host.id } });
    await prisma.kYCVerification.deleteMany({ where: { userId: host.id } });
    await prisma.user.delete({ where: { id: host.id } });
    console.log('Removed demo host and all their properties/bookings.');
  }

  if (guest) {
    await prisma.booking.deleteMany({ where: { visitorId: guest.id } });
    await prisma.review.deleteMany({ where: { visitorId: guest.id } });
    await prisma.conversation.deleteMany({ where: { visitorId: guest.id } });
    await prisma.user.delete({ where: { id: guest.id } });
    console.log('Removed demo guest.');
  }

  console.log('\nDone.');
}

main()
  .catch((e) => {
    console.error('Cleanup error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
