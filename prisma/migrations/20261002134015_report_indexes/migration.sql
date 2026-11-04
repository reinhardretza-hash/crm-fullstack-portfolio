-- CreateIndex
CREATE INDEX "deals_created_at_idx" ON "deals"("created_at");

-- CreateIndex
CREATE INDEX "deals_closed_at_idx" ON "deals"("closed_at");

-- CreateIndex
CREATE INDEX "invoices_paid_at_idx" ON "invoices"("paid_at");

-- CreateIndex
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at");

-- CreateIndex
CREATE INDEX "tasks_completed_at_idx" ON "tasks"("completed_at");
