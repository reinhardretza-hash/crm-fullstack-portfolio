-- CreateEnum
CREATE TYPE "calendar_event_status" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "activity_type" ADD VALUE 'CALENDAR_EVENT_CREATED';
ALTER TYPE "activity_type" ADD VALUE 'CALENDAR_EVENT_UPDATED';
ALTER TYPE "activity_type" ADD VALUE 'CALENDAR_EVENT_RESCHEDULED';
ALTER TYPE "activity_type" ADD VALUE 'CALENDAR_EVENT_COMPLETED';
ALTER TYPE "activity_type" ADD VALUE 'CALENDAR_EVENT_CANCELLED';
ALTER TYPE "activity_type" ADD VALUE 'CALENDAR_EVENT_REOPENED';
ALTER TYPE "activity_type" ADD VALUE 'CALENDAR_EVENT_DELETED';

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "calendar_event_id" TEXT;

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "status" "calendar_event_status" NOT NULL DEFAULT 'SCHEDULED',
    "assigned_user_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "company_id" TEXT,
    "contact_id" TEXT,
    "lead_id" TEXT,
    "deal_id" TEXT,
    "task_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_positive_duration" CHECK ("ends_at" > "starts_at");
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_positive_version" CHECK ("version" > 0);

-- CreateIndex
CREATE INDEX "calendar_events_assigned_user_id_starts_at_idx" ON "calendar_events"("assigned_user_id", "starts_at");

-- CreateIndex
CREATE INDEX "calendar_events_deleted_at_status_starts_at_idx" ON "calendar_events"("deleted_at", "status", "starts_at");

-- CreateIndex
CREATE INDEX "calendar_events_ends_at_idx" ON "calendar_events"("ends_at");

-- CreateIndex
CREATE INDEX "calendar_events_company_id_idx" ON "calendar_events"("company_id");

-- CreateIndex
CREATE INDEX "calendar_events_contact_id_idx" ON "calendar_events"("contact_id");

-- CreateIndex
CREATE INDEX "calendar_events_lead_id_idx" ON "calendar_events"("lead_id");

-- CreateIndex
CREATE INDEX "calendar_events_deal_id_idx" ON "calendar_events"("deal_id");

-- CreateIndex
CREATE INDEX "calendar_events_task_id_idx" ON "calendar_events"("task_id");

-- CreateIndex
CREATE INDEX "activities_calendar_event_id_idx" ON "activities"("calendar_event_id");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_calendar_event_id_fkey" FOREIGN KEY ("calendar_event_id") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
