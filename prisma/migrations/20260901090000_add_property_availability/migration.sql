-- Host-controlled availability, separate from the admin moderation `status`.
--
-- Defaults to true so every existing approved listing stays visible; taking
-- one off the market is an explicit action by its host.
ALTER TABLE "properties" ADD COLUMN "isAvailable" BOOLEAN NOT NULL DEFAULT true;
