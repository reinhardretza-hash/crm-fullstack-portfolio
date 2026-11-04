-- CreateEnum
CREATE TYPE "quote_status" AS ENUM ('DRAFT', 'READY', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "activity_type" ADD VALUE 'QUOTE_CREATED';
ALTER TYPE "activity_type" ADD VALUE 'QUOTE_UPDATED';
ALTER TYPE "activity_type" ADD VALUE 'QUOTE_READY';
ALTER TYPE "activity_type" ADD VALUE 'QUOTE_SENT';
ALTER TYPE "activity_type" ADD VALUE 'QUOTE_ACCEPTED';
ALTER TYPE "activity_type" ADD VALUE 'QUOTE_REJECTED';
ALTER TYPE "activity_type" ADD VALUE 'QUOTE_CANCELLED';
ALTER TYPE "activity_type" ADD VALUE 'QUOTE_EXPIRED';
ALTER TYPE "activity_type" ADD VALUE 'QUOTE_REOPENED';
ALTER TYPE "activity_type" ADD VALUE 'QUOTE_DELETED';

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "quote_id" TEXT;

-- AlterTable
ALTER TABLE "email_messages" ADD COLUMN     "quote_id" TEXT,
ADD COLUMN     "quote_version" INTEGER;

-- CreateTable
CREATE TABLE "quote_number_sequences" (
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL,

    CONSTRAINT "quote_number_sequences_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "quote_number" TEXT NOT NULL,
    "status" "quote_status" NOT NULL DEFAULT 'DRAFT',
    "company_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "deal_id" TEXT,
    "assigned_user_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "issue_date" DATE NOT NULL,
    "valid_until" DATE NOT NULL,
    "currency" TEXT NOT NULL,
    "subtotal_cents" INTEGER NOT NULL,
    "tax_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "tax_rate_basis_points" INTEGER NOT NULL DEFAULT 1900,
    "issuer_name" TEXT NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "recipient_address" TEXT NOT NULL,
    "recipient_contact" TEXT,
    "intro_text" TEXT,
    "closing_text" TEXT,
    "internal_note" TEXT,
    "customer_note" TEXT,
    "sent_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "tax_rate_basis_points" INTEGER,
    "line_subtotal_cents" INTEGER NOT NULL,
    "line_tax_cents" INTEGER NOT NULL,
    "line_total_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotes_quote_number_key" ON "quotes"("quote_number");

-- CreateIndex
CREATE INDEX "quotes_company_id_idx" ON "quotes"("company_id");

-- CreateIndex
CREATE INDEX "quotes_contact_id_idx" ON "quotes"("contact_id");

-- CreateIndex
CREATE INDEX "quotes_deal_id_idx" ON "quotes"("deal_id");

-- CreateIndex
CREATE INDEX "quotes_assigned_user_id_idx" ON "quotes"("assigned_user_id");

-- CreateIndex
CREATE INDEX "quotes_deleted_at_status_idx" ON "quotes"("deleted_at", "status");

-- CreateIndex
CREATE INDEX "quotes_issue_date_idx" ON "quotes"("issue_date");

-- CreateIndex
CREATE INDEX "quotes_valid_until_idx" ON "quotes"("valid_until");

-- CreateIndex
CREATE INDEX "quotes_updated_at_idx" ON "quotes"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "quote_items_quote_id_position_key" ON "quote_items"("quote_id", "position");

-- CreateIndex
CREATE INDEX "activities_quote_id_idx" ON "activities"("quote_id");

-- CreateIndex
CREATE INDEX "email_messages_quote_id_created_at_idx" ON "email_messages"("quote_id", "created_at");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE quotes ADD CONSTRAINT quotes_amounts_check CHECK
  (subtotal_cents >= 0 AND tax_cents >= 0 AND total_cents >= 0 AND total_cents::bigint = subtotal_cents::bigint + tax_cents::bigint);
ALTER TABLE quotes ADD CONSTRAINT quotes_dates_version_check CHECK (valid_until >= issue_date AND version > 0);
ALTER TABLE quotes ADD CONSTRAINT quotes_tax_currency_check CHECK (tax_rate_basis_points IN (0,700,1900) AND currency = 'EUR');
ALTER TABLE quotes ADD CONSTRAINT quotes_number_check CHECK (quote_number ~ '^ANG-[0-9]{4}-[0-9]{4,10}$');
ALTER TABLE quotes ADD CONSTRAINT quotes_deleted_draft_check CHECK (deleted_at IS NULL OR status = 'DRAFT');
ALTER TABLE quote_items ADD CONSTRAINT quote_items_values_check CHECK
  (position > 0 AND quantity > 0 AND unit_price_cents >= 0 AND line_subtotal_cents >= 0 AND line_tax_cents >= 0 AND line_total_cents >= 0
   AND line_total_cents::bigint = line_subtotal_cents::bigint + line_tax_cents::bigint
   AND (tax_rate_basis_points IS NULL OR tax_rate_basis_points IN (0,700,1900)));
ALTER TABLE quote_number_sequences ADD CONSTRAINT quote_sequence_values_check CHECK (year BETWEEN 1900 AND 2200 AND last_number > 0);
ALTER TABLE email_messages ADD CONSTRAINT email_quote_version_check CHECK ((quote_id IS NULL AND quote_version IS NULL) OR (quote_id IS NOT NULL AND quote_version > 0));
CREATE UNIQUE INDEX email_one_sending_quote_idx ON email_messages (quote_id) WHERE status = 'SENDING' AND quote_id IS NOT NULL;

CREATE FUNCTION prevent_quote_number_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.quote_number IS DISTINCT FROM OLD.quote_number OR NEW.currency IS DISTINCT FROM OLD.currency THEN
    RAISE EXCEPTION 'Quote number and currency are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER quote_number_immutable BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION prevent_quote_number_change();
