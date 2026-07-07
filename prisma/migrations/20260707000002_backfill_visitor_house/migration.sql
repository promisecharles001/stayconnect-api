-- Split into its own migration/transaction: Postgres won't let a newly
-- added enum value be used in the same transaction that added it.
UPDATE "properties" SET "propertyType" = 'VISITOR_HOUSE' WHERE "propertyType" = 'GUEST_HOUSE';
