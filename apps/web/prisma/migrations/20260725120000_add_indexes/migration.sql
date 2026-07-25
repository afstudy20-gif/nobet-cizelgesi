-- Indexes only: additive, no data is touched.
--
-- IF NOT EXISTS keeps this migration safe on a database that was baselined
-- at 0_init but had already been synced with `prisma db push` from a schema
-- that contained these indexes. Without it the migration aborts with 42P07
-- and leaves the migration history in a failed state that blocks every
-- subsequent boot.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CoverageRule_locationId_idx" ON "CoverageRule"("locationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CoverageRule_shiftTemplateId_idx" ON "CoverageRule"("shiftTemplateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PersonLocationRule_locationId_idx" ON "PersonLocationRule"("locationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AvailabilityRule_personId_idx" ON "AvailabilityRule"("personId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AvailabilityRule_locationId_idx" ON "AvailabilityRule"("locationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ShiftRequirement_periodId_idx" ON "ShiftRequirement"("periodId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ShiftRequirement_shiftTemplateId_idx" ON "ShiftRequirement"("shiftTemplateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ShiftRequirement_locationId_idx" ON "ShiftRequirement"("locationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Assignment_periodId_date_startDateTime_idx" ON "Assignment"("periodId", "date", "startDateTime");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Assignment_shiftRequirementId_idx" ON "Assignment"("shiftRequirementId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Assignment_personId_periodId_idx" ON "Assignment"("personId", "periodId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ConflictLog_periodId_idx" ON "ConflictLog"("periodId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ConflictLog_shiftRequirementId_idx" ON "ConflictLog"("shiftRequirementId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ConflictLog_personId_idx" ON "ConflictLog"("personId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExportTemplate_format_isDefault_idx" ON "ExportTemplate"("format", "isDefault");

