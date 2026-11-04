-- CreateEnum
CREATE TYPE "reminder_type" AS ENUM ('QUOTE_OPEN', 'DEAL_INACTIVE', 'FOLLOW_UP_DUE', 'TASK_OVERDUE', 'INVOICE_OVERDUE');

-- CreateEnum
CREATE TYPE "reminder_status" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'NO_ASSIGNEE', 'INACTIVE_ASSIGNEE', 'RESOLVED');

-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "type" "reminder_type" NOT NULL,
    "status" "reminder_status" NOT NULL DEFAULT 'PENDING',
    "dedupe_key" TEXT NOT NULL,
    "assigned_user_id" TEXT,
    "quote_id" TEXT,
    "deal_id" TEXT,
    "lead_id" TEXT,
    "task_id" TEXT,
    "invoice_id" TEXT,
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email_sent_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_settings" (
    "id" TEXT NOT NULL,
    "singleton" BOOLEAN NOT NULL DEFAULT true,
    "quote_enabled" BOOLEAN NOT NULL DEFAULT false,
    "quote_days" INTEGER NOT NULL DEFAULT 7,
    "deal_enabled" BOOLEAN NOT NULL DEFAULT false,
    "deal_days" INTEGER NOT NULL DEFAULT 14,
    "follow_up_enabled" BOOLEAN NOT NULL DEFAULT false,
    "task_enabled" BOOLEAN NOT NULL DEFAULT false,
    "invoice_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reminders_dedupe_key_key" ON "reminders"("dedupe_key");

-- CreateIndex
CREATE INDEX "reminders_status_type_idx" ON "reminders"("status", "type");

-- CreateIndex
CREATE INDEX "reminders_assigned_user_id_status_idx" ON "reminders"("assigned_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_settings_singleton_key" ON "reminder_settings"("singleton");

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Genau ein Zielobjekt je Erinnerung.
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_single_target_check"
  CHECK (num_nonnulls("quote_id", "deal_id", "lead_id", "task_id", "invoice_id") = 1);

-- Schwellwerte plausibel begrenzen.
ALTER TABLE "reminder_settings" ADD CONSTRAINT "reminder_settings_days_check"
  CHECK ("quote_days" BETWEEN 1 AND 365 AND "deal_days" BETWEEN 1 AND 365);
