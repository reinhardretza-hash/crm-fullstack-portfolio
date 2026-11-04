-- Existing fields suffice, but the original CHECK constraints reject READY.
-- Preserve document status and all relations; only broaden permitted soft deletes.
BEGIN;
ALTER TABLE quotes DROP CONSTRAINT quotes_deleted_draft_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_deleted_draft_or_ready_check
  CHECK (deleted_at IS NULL OR status IN ('DRAFT', 'READY'));
ALTER TABLE invoices DROP CONSTRAINT invoices_deleted_draft_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_deleted_draft_or_ready_check
  CHECK (deleted_at IS NULL OR status IN ('DRAFT', 'READY'));
COMMIT;
