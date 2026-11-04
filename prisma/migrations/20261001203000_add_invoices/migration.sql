-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('DRAFT', 'READY', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "activity_type" ADD VALUE 'INVOICE_CREATED';
ALTER TYPE "activity_type" ADD VALUE 'INVOICE_UPDATED';
ALTER TYPE "activity_type" ADD VALUE 'INVOICE_READY';
ALTER TYPE "activity_type" ADD VALUE 'INVOICE_SENT';
ALTER TYPE "activity_type" ADD VALUE 'INVOICE_PAID';
ALTER TYPE "activity_type" ADD VALUE 'INVOICE_CANCELLED';
ALTER TYPE "activity_type" ADD VALUE 'INVOICE_REOPENED';
ALTER TYPE "activity_type" ADD VALUE 'INVOICE_DELETED';

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "invoice_id" TEXT;

-- AlterTable
ALTER TABLE "email_messages" ADD COLUMN     "invoice_id" TEXT,
ADD COLUMN     "invoice_version" INTEGER;

-- AlterTable
ALTER TABLE "system_settings" ADD COLUMN     "bank_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bic" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "city" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "country" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "default_payment_term_days" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "iban" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "legal_company_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "postal_code" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "street" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "tax_number" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "vat_id" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "invoice_number_sequences" (
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL,

    CONSTRAINT "invoice_number_sequences_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "invoices" (
    "quote_id" TEXT,
    "issuer_snapshot" JSONB NOT NULL,
    "id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "status" "invoice_status" NOT NULL DEFAULT 'DRAFT',
    "company_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "deal_id" TEXT,
    "assigned_user_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
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
    "paid_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "tax_rate_basis_points" INTEGER NOT NULL,
    "line_subtotal_cents" INTEGER NOT NULL,
    "line_tax_cents" INTEGER NOT NULL,
    "line_total_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_quote_id_idx" ON "invoices"("quote_id");

-- CreateIndex
CREATE INDEX "invoices_company_id_idx" ON "invoices"("company_id");

-- CreateIndex
CREATE INDEX "invoices_contact_id_idx" ON "invoices"("contact_id");

-- CreateIndex
CREATE INDEX "invoices_deal_id_idx" ON "invoices"("deal_id");

-- CreateIndex
CREATE INDEX "invoices_assigned_user_id_idx" ON "invoices"("assigned_user_id");

-- CreateIndex
CREATE INDEX "invoices_deleted_at_status_idx" ON "invoices"("deleted_at", "status");

-- CreateIndex
CREATE INDEX "invoices_issue_date_idx" ON "invoices"("issue_date");

-- CreateIndex
CREATE INDEX "invoices_due_date_idx" ON "invoices"("due_date");

-- CreateIndex
CREATE INDEX "invoices_updated_at_idx" ON "invoices"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_items_invoice_id_position_key" ON "invoice_items"("invoice_id", "position");

-- CreateIndex
CREATE INDEX "activities_invoice_id_idx" ON "activities"("invoice_id");

-- CreateIndex
CREATE INDEX "email_messages_invoice_id_created_at_idx" ON "email_messages"("invoice_id", "created_at");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE invoices ADD CONSTRAINT invoices_amounts_check CHECK (subtotal_cents>=0 AND tax_cents>=0 AND total_cents>=0 AND total_cents::bigint=subtotal_cents::bigint+tax_cents::bigint);
ALTER TABLE invoices ADD CONSTRAINT invoices_dates_version_check CHECK (due_date>=issue_date AND version>0);
ALTER TABLE invoices ADD CONSTRAINT invoices_tax_currency_check CHECK (tax_rate_basis_points IN (0,700,1900) AND currency='EUR');
ALTER TABLE invoices ADD CONSTRAINT invoices_number_check CHECK (invoice_number ~ '^RE-[0-9]{4}-[0-9]{4,10}$');
ALTER TABLE invoices ADD CONSTRAINT invoices_deleted_draft_check CHECK (deleted_at IS NULL OR status='DRAFT');
ALTER TABLE invoices ADD CONSTRAINT invoices_issuer_object_check CHECK (jsonb_typeof(issuer_snapshot)='object');
ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_values_check CHECK (position>0 AND quantity>0 AND unit_price_cents>=0 AND line_subtotal_cents>=0 AND line_tax_cents>=0 AND line_total_cents>=0 AND line_total_cents::bigint=line_subtotal_cents::bigint+line_tax_cents::bigint AND tax_rate_basis_points IN (0,700,1900));
ALTER TABLE invoice_number_sequences ADD CONSTRAINT invoice_sequence_values_check CHECK (year BETWEEN 1900 AND 2200 AND last_number>0);
ALTER TABLE email_messages ADD CONSTRAINT email_invoice_version_check CHECK ((invoice_id IS NULL AND invoice_version IS NULL) OR (invoice_id IS NOT NULL AND invoice_version IS NOT NULL AND invoice_version>0));
ALTER TABLE email_messages ADD CONSTRAINT email_single_document_check CHECK (quote_id IS NULL OR invoice_id IS NULL);
ALTER TABLE system_settings ADD CONSTRAINT settings_payment_term_check CHECK (default_payment_term_days BETWEEN 0 AND 365);
CREATE UNIQUE INDEX email_one_sending_invoice_idx ON email_messages(invoice_id) WHERE status='SENDING' AND invoice_id IS NOT NULL;
CREATE FUNCTION prevent_invoice_identity_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.quote_id IS DISTINCT FROM OLD.quote_id THEN
  RAISE EXCEPTION 'Invoice number, currency and quote relation are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER invoice_identity_immutable BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION prevent_invoice_identity_change();
