-- CreateEnum
CREATE TYPE "lead_status" AS ENUM ('OPEN', 'WON', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'VERY_HIGH');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "activity_type" ADD VALUE 'LEAD_CREATED';
ALTER TYPE "activity_type" ADD VALUE 'LEAD_UPDATED';
ALTER TYPE "activity_type" ADD VALUE 'LEAD_STAGE_CHANGED';
ALTER TYPE "activity_type" ADD VALUE 'LEAD_WON';
ALTER TYPE "activity_type" ADD VALUE 'LEAD_LOST';
ALTER TYPE "activity_type" ADD VALUE 'LEAD_FOLLOW_UP_CHANGED';

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "lead_id" TEXT;

-- AlterTable
ALTER TABLE "notes" ADD COLUMN     "lead_id" TEXT;

-- CreateTable
CREATE TABLE "pipelines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "probability" INTEGER,
    "color" TEXT,
    "is_won_stage" BOOLEAN NOT NULL DEFAULT false,
    "is_lost_stage" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contact_id" TEXT,
    "company_id" TEXT,
    "pipeline_id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "source" "source",
    "interest" "potential_need",
    "expected_value_cents" INTEGER,
    "score" INTEGER NOT NULL DEFAULT 0,
    "priority" "priority" NOT NULL DEFAULT 'NORMAL',
    "probability" INTEGER,
    "assigned_user_id" TEXT,
    "next_follow_up_at" TIMESTAMP(3),
    "status" "lead_status" NOT NULL DEFAULT 'OPEN',
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_pipeline_id_position_key" ON "pipeline_stages"("pipeline_id", "position");

-- CreateIndex
CREATE INDEX "leads_pipeline_id_idx" ON "leads"("pipeline_id");

-- CreateIndex
CREATE INDEX "leads_stage_id_idx" ON "leads"("stage_id");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_assigned_user_id_idx" ON "leads"("assigned_user_id");

-- CreateIndex
CREATE INDEX "leads_next_follow_up_at_idx" ON "leads"("next_follow_up_at");

-- CreateIndex
CREATE INDEX "leads_priority_idx" ON "leads"("priority");

-- CreateIndex
CREATE INDEX "leads_score_idx" ON "leads"("score");

-- CreateIndex
CREATE INDEX "leads_deleted_at_idx" ON "leads"("deleted_at");

-- CreateIndex
CREATE INDEX "leads_updated_at_idx" ON "leads"("updated_at");

-- CreateIndex
CREATE INDEX "activities_lead_id_idx" ON "activities"("lead_id");

-- CreateIndex
CREATE INDEX "notes_lead_id_idx" ON "notes"("lead_id");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ein Lead darf mit Company, Contact oder beiden verbunden sein, aber nicht
-- mit keinem von beiden (bewusste Entscheidung, siehe Kommentar am Lead-
-- Model in schema.prisma) - OR, nicht XOR.
ALTER TABLE "leads"
  ADD CONSTRAINT "leads_has_company_or_contact_check"
  CHECK (company_id IS NOT NULL OR contact_id IS NOT NULL);

-- Note-Zielconstraint von Company-XOR-Contact (Phase 2) auf
-- Company-XOR-Contact-XOR-Lead erweitern. Zod validiert dasselbe bereits auf
-- Anwendungsebene; diese Constraint ist das zusätzliche DB-seitige Netz.
ALTER TABLE "notes" DROP CONSTRAINT IF EXISTS "notes_exactly_one_target_check";
ALTER TABLE "notes"
  ADD CONSTRAINT "notes_exactly_one_target_check"
  CHECK (
    (CASE WHEN company_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN lead_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  );

-- Genau eine Standardpipeline: ein partieller Unique-Index (Prisma kennt
-- keine deklarative Syntax dafür) statt nur einer Seed-Disziplin.
CREATE UNIQUE INDEX "pipelines_single_default_idx" ON "pipelines" ("is_default") WHERE "is_default" = true;
