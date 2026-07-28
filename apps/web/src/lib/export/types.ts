/**
 * Plain data contract shared by the format builders.
 *
 * The builders are pure functions over already-loaded data: no Prisma, no
 * `fetch`, no DOM access, so they stay unit-testable and run identically in the
 * browser and under Node. The page (via `index.ts`) is responsible for loading
 * this shape through the repository layer before calling a builder.
 *
 * Every date field is an ISO-8601 string, matching the local-first data model
 * in `lib/db/types.ts`.
 */

import type {
  Assignment,
  ConflictLog,
  SchedulePeriod,
  ShiftRequirement,
} from "@/lib/db/types";
import type { Location } from "@/lib/db/types";
import type { Person } from "@/lib/db/types";
import type { ShiftTemplate } from "@/lib/db/types";
import type { ExportTemplate } from "@/lib/db/types";

export type ExportViewMode = "grid" | "person" | "location";

export type ExportFormat = "EXCEL" | "WORD" | "PDF";

/** A requirement resolved with its referenced location and shift template. */
export interface DetailedRequirement extends ShiftRequirement {
  location: Location | null;
  shiftTemplate: ShiftTemplate | null;
}

/** An assignment resolved with its person and requirement detail. */
export interface DetailedAssignment extends Assignment {
  person: Person | null;
  shiftRequirement: DetailedRequirement | null;
}

/**
 * All the plain data a builder needs, in one serialisable bundle.
 * Mirrors `repo.SchedulePeriodsRepo.getExportData`.
 */
export interface ExportInput {
  period: SchedulePeriod;
  requirements: DetailedRequirement[];
  assignments: DetailedAssignment[];
  conflictLogs: ConflictLog[];
}

/**
 * Override knobs the user can set on the export page. Anything absent falls
 * back to the template config or sensible defaults (see `resolveExportOptions`).
 */
export interface ExportOverrides {
  hospitalName?: string;
  /** `YYYY-MM`. */
  workingMonth?: string;
  /** `"tr"` (Turkish) or `"en"` (English), per the i18n locale. */
  locale?: "tr" | "en";
  view?: ExportViewMode;
  includeSummary?: boolean;
  includeConflicts?: boolean;
}

/** What `resolveExportOptions` produces for the builders. */
export interface ResolvedExportOptions {
  hospitalName: string;
  workingMonth: string;
  monthLabel: string;
  year: string;
  title: string;
  view: ExportViewMode;
  includeSummary: boolean;
  includeConflicts: boolean;
  template: ExportTemplate | null;
  placeholderVars: ReturnType<typeof import("./placeholders").buildPlaceholderVars>;
  locale: "tr" | "en";
}
