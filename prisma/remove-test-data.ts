/**
 * Removes the test accounts left behind by QA passes, and everything that
 * references them.
 *
 * Scope is deliberately narrow: only users whose email ends in
 * "@example.com" or "@e2e-test.invalid". Both domains are reserved by RFC
 * (2606 and 6761 respectively) for exactly this, cannot receive mail, and no
 * real account on this deployment uses them — every genuine user is on
 * gmail.com or stayconnect.ng. Nothing else is matched, so this cannot touch
 * a customer account, the admins, or the roles table.
 *
 * Bookings, reviews and conversations attached to a *test property* are also
 * removed even when the other party is a real user, because the property
 * itself is going away and those rows would otherwise dangle.
 *
 * Dry run (prints what it would delete, changes nothing):
 *   npx ts-node prisma/remove-test-data.ts
 *
 * Execute:
 *   npx ts-node prisma/remove-test-data.ts --yes
 *
 * Safe to run more than once — a second run is a no-op.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EXECUTE = process.argv.includes('--yes');

// Kept as a list so adding a future throwaway domain is one line, and so the
// dry-run message and the delete can never disagree about what is in scope.
const TEST_EMAIL_DOMAINS = ['@example.com', '@e2e-test.invalid'];

async function main() {
  const testUsers = await prisma.user.findMany({
    where: {
      OR: TEST_EMAIL_DOMAINS.map((domain) => ({
        email: { endsWith: domain },
      })),
    },
    select: { id: true, email: true, role: { select: { name: true } } },
  });

  if (testUsers.length === 0) {
    console.log(
      `No ${TEST_EMAIL_DOMAINS.join(' or ')} accounts found — nothing to clean up.`,
    );
    return;
  }

  const userIds = testUsers.map((u) => u.id);

  const properties = await prisma.property.findMany({
    where: { hostId: { in: userIds } },
    select: { id: true, title: true },
  });
  const propertyIds = properties.map((p) => p.id);

  // Anything tied to a test user OR to a property a test user owns.
  const touchesTest = {
    OR: [
      { visitorId: { in: userIds } },
      { hostId: { in: userIds } },
      { propertyId: { in: propertyIds } },
    ],
  };

  const [bookings, reviews, conversations, ledger, withdrawals, wishlist, kyc] =
    await Promise.all([
      prisma.booking.count({ where: touchesTest }),
      prisma.review.count({ where: touchesTest }),
      prisma.conversation.count({ where: touchesTest }),
      prisma.earningsLedger.count({ where: { hostId: { in: userIds } } }),
      prisma.withdrawalRequest.count({ where: { hostId: { in: userIds } } }),
      prisma.wishlistItem.count({
        where: { OR: [{ userId: { in: userIds } }, { propertyId: { in: propertyIds } }] },
      }),
      prisma.kYCVerification.count({ where: { userId: { in: userIds } } }),
    ]);

  console.log(`\nTest accounts (${testUsers.length}):`);
  for (const u of testUsers) console.log(`  - ${u.email}  [${u.role?.name}]`);
  console.log(`\nProperties owned by them (${properties.length}):`);
  for (const p of properties) console.log(`  - ${p.title}`);
  console.log('\nRows that will be removed:');
  console.log(`  bookings           ${bookings}`);
  console.log(`  reviews            ${reviews}`);
  console.log(`  conversations      ${conversations}  (messages cascade with these)`);
  console.log(`  earnings ledger    ${ledger}`);
  console.log(`  withdrawals        ${withdrawals}`);
  console.log(`  wishlist items     ${wishlist}`);
  console.log(`  kyc verifications  ${kyc}`);
  console.log(`  properties         ${properties.length}`);
  console.log(`  users              ${testUsers.length}`);

  if (!EXECUTE) {
    console.log('\nDRY RUN — nothing was deleted. Re-run with --yes to execute.');
    return;
  }

  // Order matters: bookings, ledger and withdrawals have no onDelete cascade
  // to User, and bookings have none to Property either, so they have to go
  // before the rows they point at.
  console.log('\nDeleting...');
  await prisma.booking.deleteMany({ where: touchesTest });
  await prisma.review.deleteMany({ where: touchesTest });
  await prisma.conversation.deleteMany({ where: touchesTest });
  await prisma.earningsLedger.deleteMany({ where: { hostId: { in: userIds } } });
  await prisma.withdrawalRequest.deleteMany({ where: { hostId: { in: userIds } } });
  await prisma.wishlistItem.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { propertyId: { in: propertyIds } }] },
  });
  await prisma.property.deleteMany({ where: { hostId: { in: userIds } } });
  await prisma.kYCVerification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  const left = await prisma.user.count({
    where: {
      OR: TEST_EMAIL_DOMAINS.map((domain) => ({
        email: { endsWith: domain },
      })),
    },
  });
  console.log(`Done. Remaining test accounts: ${left}`);
}

main()
  .catch((e) => {
    console.error('Cleanup error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
