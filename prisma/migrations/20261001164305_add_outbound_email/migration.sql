-- CreateEnum
CREATE TYPE "email_direction" AS ENUM ('OUTBOUND');

-- CreateEnum
CREATE TYPE "email_status" AS ENUM ('DRAFT', 'SENDING', 'SENT', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "activity_type" ADD VALUE 'EMAIL_SENT';
ALTER TYPE "activity_type" ADD VALUE 'EMAIL_FAILED';

-- CreateTable
CREATE TABLE "email_messages" (
    "id" TEXT NOT NULL,
    "direction" "email_direction" NOT NULL DEFAULT 'OUTBOUND',
    "status" "email_status" NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "from_name" TEXT,
    "to_email" TEXT NOT NULL,
    "to_name" TEXT,
    "subject" TEXT NOT NULL,
    "text_body" TEXT NOT NULL,
    "html_body" TEXT,
    "contact_id" TEXT,
    "company_id" TEXT,
    "lead_id" TEXT,
    "deal_id" TEXT,
    "sent_by_user_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "provider_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_messages_idempotency_key_key" ON "email_messages"("idempotency_key");

-- CreateIndex
CREATE INDEX "email_messages_sent_by_user_id_created_at_idx" ON "email_messages"("sent_by_user_id", "created_at");

-- CreateIndex
CREATE INDEX "email_messages_status_created_at_idx" ON "email_messages"("status", "created_at");

-- CreateIndex
CREATE INDEX "email_messages_contact_id_created_at_idx" ON "email_messages"("contact_id", "created_at");

-- CreateIndex
CREATE INDEX "email_messages_company_id_created_at_idx" ON "email_messages"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "email_messages_lead_id_created_at_idx" ON "email_messages"("lead_id", "created_at");

-- CreateIndex
CREATE INDEX "email_messages_deal_id_created_at_idx" ON "email_messages"("deal_id", "created_at");

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_sent_by_user_id_fkey" FOREIGN KEY ("sent_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
