-- CreateEnum
CREATE TYPE "deal_status" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "deal_lost_reason" AS ENUM ('PRICE', 'NO_BUDGET', 'NO_NEED', 'COMPETITOR', 'NO_RESPONSE', 'POSTPONED', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "activity_type" ADD VALUE 'DEAL_CREATED';
ALTER TYPE "activity_type" ADD VALUE 'DEAL_UPDATED';
ALTER TYPE "activity_type" ADD VALUE 'DEAL_WON';
ALTER TYPE "activity_type" ADD VALUE 'DEAL_LOST';
ALTER TYPE "activity_type" ADD VALUE 'DEAL_REOPENED';

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "deal_id" TEXT;

-- AlterTable
ALTER TABLE "notes" ADD COLUMN     "deal_id" TEXT;

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lead_id" TEXT,
    "company_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "assigned_user_id" TEXT,
    "service" "potential_need" NOT NULL,
    "value_cents" INTEGER NOT NULL,
    "probability" INTEGER,
    "expected_close_date" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "status" "deal_status" NOT NULL DEFAULT 'OPEN',
    "lost_reason" "deal_lost_reason",
    "lost_reason_note" TEXT,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deals_company_id_idx" ON "deals"("company_id");

-- CreateIndex
CREATE INDEX "deals_contact_id_idx" ON "deals"("contact_id");

-- CreateIndex
CREATE INDEX "deals_lead_id_idx" ON "deals"("lead_id");

-- CreateIndex
CREATE INDEX "deals_status_idx" ON "deals"("status");

-- CreateIndex
CREATE INDEX "deals_assigned_user_id_idx" ON "deals"("assigned_user_id");

-- CreateIndex
CREATE INDEX "deals_service_idx" ON "deals"("service");

-- CreateIndex
CREATE INDEX "deals_expected_close_date_idx" ON "deals"("expected_close_date");

-- CreateIndex
CREATE INDEX "deals_deleted_at_idx" ON "deals"("deleted_at");

-- CreateIndex
CREATE INDEX "deals_updated_at_idx" ON "deals"("updated_at");

-- CreateIndex
CREATE INDEX "activities_deal_id_idx" ON "activities"("deal_id");

-- CreateIndex
CREATE INDEX "notes_deal_id_idx" ON "notes"("deal_id");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Note-XOR auf 4 Wege erweitert (Company/Contact/Lead/Deal), ersetzt die
-- 3-Wege-Variante aus Phase 3.
ALTER TABLE "notes" DROP CONSTRAINT IF EXISTS "notes_exactly_one_target_check";
ALTER TABLE "notes"
  ADD CONSTRAINT "notes_exactly_one_target_check"
  CHECK (
    (CASE WHEN company_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN lead_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN deal_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  );
