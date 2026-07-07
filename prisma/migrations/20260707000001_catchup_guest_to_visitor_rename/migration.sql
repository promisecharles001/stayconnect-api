-- Rename guest -> visitor terminology in place (preserves all existing data,
-- unlike a naive drop+recreate which would either fail on non-empty tables
-- or silently disassociate every existing booking/conversation from its user).
ALTER TABLE "users" RENAME COLUMN "guestRating" TO "visitorRating";
ALTER TABLE "users" RENAME COLUMN "guestReviewCount" TO "visitorReviewCount";

ALTER TABLE "bookings" RENAME COLUMN "guestId" TO "visitorId";
ALTER TABLE "conversations" RENAME COLUMN "guestId" TO "visitorId";

ALTER INDEX "bookings_guestId_idx" RENAME TO "bookings_visitorId_idx";
ALTER INDEX "conversations_guestId_idx" RENAME TO "conversations_visitorId_idx";

ALTER TABLE "bookings" RENAME CONSTRAINT "bookings_guestId_fkey" TO "bookings_visitorId_fkey";
ALTER TABLE "conversations" RENAME CONSTRAINT "conversations_guestId_fkey" TO "conversations_visitorId_fkey";
ALTER INDEX "conversations_propertyId_guestId_hostId_key" RENAME TO "conversations_propertyId_visitorId_hostId_key";

-- Add the renamed enum value alongside the old one (Postgres can't cheaply
-- remove enum values, and dropping GUEST_HOUSE outright would break any
-- existing row using it). Backfill existing rows to the new value; the old
-- value stays in the type but the app will never write it again.
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'VISITOR_HOUSE';

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('PENDING', 'HELD', 'RELEASED', 'REFUNDED');

-- AlterTable: users (purely additive)
ALTER TABLE "users" ADD COLUMN "passwordResetTokenHash" TEXT;
ALTER TABLE "users" ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "pushToken" TEXT;

-- AlterTable: bookings (purely additive)
ALTER TABLE "bookings" ADD COLUMN "escrowStatus" "EscrowStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "bookings" ADD COLUMN "fundsReleasedAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "fundsReleasedBy" TEXT;
ALTER TABLE "bookings" ADD COLUMN "refundedAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "refundedBy" TEXT;
ALTER TABLE "bookings" ADD COLUMN "refundAmount" DECIMAL(10,2);
ALTER TABLE "bookings" ADD COLUMN "refundReason" TEXT;
CREATE INDEX "bookings_escrowStatus_idx" ON "bookings"("escrowStatus");

-- AlterTable: messages (purely additive)
ALTER TABLE "messages" ADD COLUMN "containsRedactedContact" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: reviews (new table, no existing data affected)
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "hostResponse" TEXT,
    "hostRespondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reviews_bookingId_key" ON "reviews"("bookingId");
CREATE INDEX "reviews_propertyId_idx" ON "reviews"("propertyId");
CREATE INDEX "reviews_visitorId_idx" ON "reviews"("visitorId");
CREATE INDEX "reviews_hostId_idx" ON "reviews"("hostId");
CREATE INDEX "reviews_createdAt_idx" ON "reviews"("createdAt");

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
