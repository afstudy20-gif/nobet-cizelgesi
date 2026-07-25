-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('WEEKLY', 'SPECIFIC_DATE', 'DATE_RANGE', 'ONE_DAY');

-- CreateEnum
CREATE TYPE "AvailabilityType" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'PREFERRED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ASSIGNED', 'UNFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentSource" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ConflictSeverity" AS ENUM ('WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('EXCEL', 'WORD', 'PDF');

-- CreateEnum
CREATE TYPE "ExportTemplateSource" AS ENUM ('BUILTIN', 'CUSTOM', 'UPLOADED');

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "role" TEXT NOT NULL DEFAULT 'ASISTAN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "crossesMidnight" BOOLEAN NOT NULL DEFAULT false,
    "requiredHeadcount" INTEGER NOT NULL DEFAULT 1,
    "defaultLocationId" TEXT,
    "color" TEXT,
    "isNightShift" BOOLEAN NOT NULL DEFAULT false,
    "isOnCall" BOOLEAN NOT NULL DEFAULT false,
    "minimumRestHoursAfter" INTEGER NOT NULL DEFAULT 12,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ShiftTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageRule" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "shiftTemplateId" TEXT NOT NULL,
    "ruleType" "RuleType" NOT NULL,
    "weekdays" INTEGER[],
    "specificDate" TIMESTAMP(3),
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "requiredHeadcount" INTEGER NOT NULL DEFAULT 1,
    "roleRequirements" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CoverageRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonLocationRule" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PersonLocationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonWorkRule" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "minAssignmentsPerPeriod" INTEGER,
    "maxAssignmentsPerPeriod" INTEGER,
    "maxNightAssignmentsPerPeriod" INTEGER,
    "maxWeekendAssignmentsPerPeriod" INTEGER,
    "maxOnCallAssignmentsPerPeriod" INTEGER,
    "maxConsecutiveDays" INTEGER,
    "minRestHoursBetweenAssignments" INTEGER NOT NULL DEFAULT 12,
    "allowBackToBackNightShift" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PersonWorkRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityRule" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "ruleType" "RuleType" NOT NULL,
    "availabilityType" "AvailabilityType" NOT NULL,
    "weekdays" INTEGER[],
    "startTime" TEXT,
    "endTime" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "locationId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulePeriod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "generationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftRequirement" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shiftTemplateId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "requiredHeadcount" INTEGER NOT NULL,
    "roleRequirements" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShiftRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "shiftRequirementId" TEXT NOT NULL,
    "personId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startDateTime" TIMESTAMP(3) NOT NULL,
    "endDateTime" TIMESTAMP(3) NOT NULL,
    "role" TEXT,
    "isOnCall" BOOLEAN NOT NULL DEFAULT false,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "source" "AssignmentSource" NOT NULL DEFAULT 'AUTO',
    "score" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConflictLog" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "shiftRequirementId" TEXT,
    "personId" TEXT,
    "type" TEXT NOT NULL,
    "severity" "ConflictSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConflictLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "format" "ExportFormat" NOT NULL,
    "sourceType" "ExportTemplateSource" NOT NULL DEFAULT 'CUSTOM',
    "hospitalName" TEXT,
    "titleTemplate" TEXT NOT NULL DEFAULT '{{hospital}} — {{month}} {{year}} Nöbet Çizelgesi',
    "config" JSONB NOT NULL DEFAULT '{}',
    "fileName" TEXT,
    "fileData" BYTEA,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Person_code_key" ON "Person"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Location_code_key" ON "Location"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftTemplate_code_key" ON "ShiftTemplate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PersonLocationRule_personId_locationId_key" ON "PersonLocationRule"("personId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonWorkRule_personId_key" ON "PersonWorkRule"("personId");

-- AddForeignKey
ALTER TABLE "ShiftTemplate" ADD CONSTRAINT "ShiftTemplate_defaultLocationId_fkey" FOREIGN KEY ("defaultLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageRule" ADD CONSTRAINT "CoverageRule_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageRule" ADD CONSTRAINT "CoverageRule_shiftTemplateId_fkey" FOREIGN KEY ("shiftTemplateId") REFERENCES "ShiftTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLocationRule" ADD CONSTRAINT "PersonLocationRule_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLocationRule" ADD CONSTRAINT "PersonLocationRule_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonWorkRule" ADD CONSTRAINT "PersonWorkRule_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftRequirement" ADD CONSTRAINT "ShiftRequirement_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "SchedulePeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftRequirement" ADD CONSTRAINT "ShiftRequirement_shiftTemplateId_fkey" FOREIGN KEY ("shiftTemplateId") REFERENCES "ShiftTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftRequirement" ADD CONSTRAINT "ShiftRequirement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "SchedulePeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_shiftRequirementId_fkey" FOREIGN KEY ("shiftRequirementId") REFERENCES "ShiftRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictLog" ADD CONSTRAINT "ConflictLog_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "SchedulePeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictLog" ADD CONSTRAINT "ConflictLog_shiftRequirementId_fkey" FOREIGN KEY ("shiftRequirementId") REFERENCES "ShiftRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictLog" ADD CONSTRAINT "ConflictLog_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

