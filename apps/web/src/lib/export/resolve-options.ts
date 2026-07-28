import { ExportTemplateConfigSchema } from "@nobet/shared";
import type { ExportTemplate, SchedulePeriod } from "@/lib/db/types";
import { applyPlaceholders, buildPlaceholderVars } from "./placeholders";
import { formatMonthLabel, parseYearMonth, yearMonthFromDate } from "./month-label";
import type { ExportFormat, ExportOverrides, ExportViewMode, ResolvedExportOptions } from "./types";

export type { ExportViewMode, ResolvedExportOptions } from "./types";

const DEFAULT_TITLE_TEMPLATE = "{{hospital}} — {{month}} {{year}} Nöbet Çizelgesi";

/**
 * Resolve export options from a loaded period, an already-loaded template
 * (or `null`) and an overrides bag. Pure and synchronous: no Prisma, no I/O.
 *
 * Template resolution is the caller's job — the repo already selected it by id
 * or by `isDefault`. Here we only normalise the resulting config and apply the
 * overrides that match the old query-string behaviour (explicit override wins,
 * else template config, else default).
 */
export function resolveExportOptions(
  period: Pick<SchedulePeriod, "name" | "startDate">,
  template: ExportTemplate | null,
  overrides: ExportOverrides,
  format: ExportFormat
): ResolvedExportOptions {
  void format;

  const configResult = ExportTemplateConfigSchema.safeParse(template?.config ?? {});
  const config = configResult.success ? configResult.data : ExportTemplateConfigSchema.parse({});

  const hospitalName =
    overrides.hospitalName?.trim() ||
    template?.hospitalName?.trim() ||
    "Hastane";

  const workingMonth =
    overrides.workingMonth?.trim() || yearMonthFromDate(period.startDate);

  const parsedMonth = parseYearMonth(workingMonth);
  const monthLabel = parsedMonth
    ? formatMonthLabel(workingMonth, "tr")
    : formatMonthLabel(yearMonthFromDate(period.startDate), "tr");
  const year = parsedMonth?.year ?? period.startDate.slice(0, 4);

  const titleTemplate = template?.titleTemplate ?? DEFAULT_TITLE_TEMPLATE;

  const placeholderVars = buildPlaceholderVars({
    hospitalName,
    monthLabel,
    year,
    periodName: period.name,
    title: "",
  });

  const title = applyPlaceholders(titleTemplate, placeholderVars);
  placeholderVars.title = title;
  placeholderVars.TITLE = title;

  const view: ExportViewMode = overrides.view ?? config.view;
  const includeSummary = overrides.includeSummary ?? config.includeSummary;
  const includeConflicts = overrides.includeConflicts ?? config.includeConflicts;

  return {
    hospitalName,
    workingMonth,
    monthLabel,
    year,
    title,
    view,
    includeSummary,
    includeConflicts,
    template,
    placeholderVars,
    locale: overrides.locale ?? "tr",
  };
}

/**
 * Build the output filename for a format, matching the old route handlers'
 * slug + month convention.
 */
export function buildExportFilename(
  format: ExportFormat,
  options: Pick<ResolvedExportOptions, "workingMonth" | "hospitalName">
): string {
  const extension = format === "EXCEL" ? "xlsx" : format === "WORD" ? "docx" : "html";
  const hospitalSlug = options.hospitalName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const slugPart = hospitalSlug ? `-${hospitalSlug}` : "";
  const prefix = format === "EXCEL" ? "nobet-plani" : format === "WORD" ? "nobet-raporu" : "nobet-plani";
  return `${prefix}-${options.workingMonth}${slugPart}.${extension}`;
}
