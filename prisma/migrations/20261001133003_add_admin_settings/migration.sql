-- CreateEnum
CREATE TYPE "lead_score_rule_name" AS ENUM ('LINKEDIN_SOURCE', 'DACH_COMPANY', 'SME_COMPANY', 'NEED_IDENTIFIED');

-- DropIndex
DROP INDEX "pipeline_stages_pipeline_id_position_key";

-- AlterTable
ALTER TABLE "pipeline_stages" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "auth_version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "lead_score_rules" (
    "id" TEXT NOT NULL,
    "rule" "lead_score_rule_name" NOT NULL,
    "points" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_score_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "singleton" BOOLEAN NOT NULL DEFAULT true,
    "company_name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_score_rules_rule_key" ON "lead_score_rules"("rule");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_singleton_key" ON "system_settings"("singleton");

-- CreateIndex
CREATE INDEX "pipeline_stages_pipeline_id_position_idx" ON "pipeline_stages"("pipeline_id", "position");

-- CreateIndex
CREATE INDEX "pipeline_stages_deleted_at_idx" ON "pipeline_stages"("deleted_at");

-- Partielle Unique-Indizes statt normaler @@unique-Constraints, damit eine
-- soft-gelöschte Stufe keinen Positions-Slot bzw. Won-/Lost-Flag mehr
-- blockiert. Die beiden Won-/Lost-Indizes aus Phase 3 (siehe Migration
-- 20261001084350_harden_pipeline_stage_invariants) werden entsprechend
-- ersetzt.
CREATE UNIQUE INDEX "pipeline_stages_pipeline_id_position_key"
  ON "pipeline_stages" ("pipeline_id", "position")
  WHERE "deleted_at" IS NULL;

DROP INDEX "pipeline_stages_single_won_per_pipeline_idx";
CREATE UNIQUE INDEX "pipeline_stages_single_won_per_pipeline_idx"
  ON "pipeline_stages" ("pipeline_id")
  WHERE "is_won_stage" = true AND "deleted_at" IS NULL;

DROP INDEX "pipeline_stages_single_lost_per_pipeline_idx";
CREATE UNIQUE INDEX "pipeline_stages_single_lost_per_pipeline_idx"
  ON "pipeline_stages" ("pipeline_id")
  WHERE "is_lost_stage" = true AND "deleted_at" IS NULL;
