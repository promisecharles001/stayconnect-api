/**
 * Audits isInstantBook across every property row.
 *
 * Why this exists: the field had @IsOptional() and no type validator, so
 * nothing checked it, and the global pipe's enableImplicitConversion coerces
 * by truthiness — the string "false" would have been stored as `true`. That
 * was fixed, but the fix does not touch rows already written.
 *
 * The column is Boolean in Postgres, so no row can hold a non-boolean; the
 * only possible damage is a `true` that should have been `false`. The app
 * never sends this field at all (it appears nowhere in the frontend outside
 * a type and a test fixture) and the schema default is false, so any `true`
 * came from a hand-crafted API call — Swagger, curl or similar — and is
 * worth a look.
 *
 * Read-only. This script changes nothing.
 *
 *   npx ts-node prisma/audit-instant-book.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // No status or availability filter: the public API hides rows that are
  // unavailable or not APPROVED, which is exactly the blind spot this is
  // here to cover.
  const properties = await prisma.property.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      isAvailable: true,
      isInstantBook: true,
      createdAt: true,
      host: { select: { email: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Properties in database: ${properties.length}\n`);

  if (properties.length === 0) {
    console.log('Nothing to audit.');
    return;
  }

  const instantBookOn = properties.filter((p) => p.isInstantBook);

  for (const p of properties) {
    const flag = p.isInstantBook ? 'instant-book ON ' : 'instant-book off';
    const hidden = p.isAvailable ? '' : '  [hidden from public listing]';
    console.log(
      `  ${flag}  ${p.status.padEnd(16)} ${p.title}  <${p.host.email}>${hidden}`,
    );
  }

  console.log('');
  if (instantBookOn.length === 0) {
    console.log(
      'All rows are false, which is the schema default and the only value ' +
        'the app can produce. No row was affected by the missing validator.',
    );
  } else {
    console.log(
      `${instantBookOn.length} row(s) have instant-book ON. The app cannot set ` +
        `this field, so confirm with the host that each was intentional:`,
    );
    for (const p of instantBookOn) {
      console.log(`  - ${p.id}  ${p.title}  <${p.host.email}>`);
    }
    console.log(
      '\nTo turn one off:\n' +
        "  await prisma.property.update({ where: { id: '<id>' }, " +
        'data: { isInstantBook: false } })',
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
