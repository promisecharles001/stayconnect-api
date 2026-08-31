-- Saved payout destination for hosts, so bank details are entered once
-- rather than retyped on every withdrawal request.
--
-- All nullable: existing hosts have none until they save them, and the
-- withdrawal form still accepts details entered inline.
ALTER TABLE "users" ADD COLUMN "payoutBankName" TEXT;
ALTER TABLE "users" ADD COLUMN "payoutBankCode" TEXT;
ALTER TABLE "users" ADD COLUMN "payoutAccountNumber" TEXT;
ALTER TABLE "users" ADD COLUMN "payoutAccountName" TEXT;
ALTER TABLE "users" ADD COLUMN "payoutUpdatedAt" TIMESTAMP(3);
