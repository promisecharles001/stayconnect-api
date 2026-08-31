-- The short code a visitor puts in their bank transfer description, so an
-- admin can match a line on the bank statement to a booking.
--
-- Added nullable, backfilled, then made NOT NULL + UNIQUE, so this runs
-- against a table that already has rows.
ALTER TABLE "bookings" ADD COLUMN "reference" TEXT;

-- Backfill with exactly the expression the client used to derive on the fly:
-- 'BK-' + the first 8 characters of the id, uppercased. Existing visitors
-- have already been given these codes for transfers that may not have been
-- reconciled yet, so they have to keep resolving to the same booking.
UPDATE "bookings"
SET "reference" = 'BK-' || UPPER(SUBSTRING("id" FROM 1 FOR 8))
WHERE "reference" IS NULL;

-- Guard against the (vanishingly unlikely) case of two ids sharing their
-- first 8 hex characters: fall back to a longer slice for any duplicate so
-- the unique index below can be created.
WITH duplicated AS (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "reference" ORDER BY "createdAt") AS rn
  FROM "bookings"
)
UPDATE "bookings" b
SET "reference" = 'BK-' || UPPER(SUBSTRING(b."id" FROM 1 FOR 12))
FROM duplicated d
WHERE b."id" = d."id" AND d.rn > 1;

ALTER TABLE "bookings" ALTER COLUMN "reference" SET NOT NULL;

CREATE UNIQUE INDEX "bookings_reference_key" ON "bookings"("reference");
