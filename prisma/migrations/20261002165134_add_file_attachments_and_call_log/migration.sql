-- AlterEnum
ALTER TYPE "activity_type" ADD VALUE 'CALL_LOGGED';

-- CreateTable
CREATE TABLE "file_attachments" (
    "id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "stored_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by_user_id" TEXT NOT NULL,
    "company_id" TEXT,
    "contact_id" TEXT,
    "deal_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "file_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "file_attachments_stored_name_key" ON "file_attachments"("stored_name");

-- CreateIndex
CREATE INDEX "file_attachments_company_id_deleted_at_idx" ON "file_attachments"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "file_attachments_contact_id_deleted_at_idx" ON "file_attachments"("contact_id", "deleted_at");

-- CreateIndex
CREATE INDEX "file_attachments_deal_id_deleted_at_idx" ON "file_attachments"("deal_id", "deleted_at");

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Genau ein Ziel je Datei.
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_single_target_check"
  CHECK (num_nonnulls("company_id", "contact_id", "deal_id") = 1);
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_size_check"
  CHECK ("size_bytes" > 0);
