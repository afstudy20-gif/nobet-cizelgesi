import type { ExportFormat, ExportTemplate, SchedulePeriod } from "@prisma/client";
import { ExportTemplateConfigSchema } from "@nobet/shared";
import { prisma } from "@/lib/prisma";
import { applyPlaceholders, buildPlaceholderVars } from "./placeholders";
import { formatMonthLabel, parseYearMonth, yearMonthFromDate } from "./month-label";

export type ExportViewMode = "grid" | "person" | "location";

export type ResolvedExportOptions = {
  hospitalName: string;
  workingMonth: string;
  monthLabel: string;
  year: string;
  title: string;
  view: ExportViewMode;
  includeSummary: boolean;
  includeConflicts: boolean;
  template: ExportTemplate | null;
  placeholderVars: ReturnType<typeof buildPlaceholderVars>;
};

type SearchParamsLike = {
  get(name: string): string | null;
};

export async function resolveExportOptions(
  searchParams: SearchParamsLike,
  period: SchedulePeriod,
  format: ExportFormat
): Promise<ResolvedExportOptions> {
  const templateId = searchParams.get("templateId");

  let template: ExportTemplate | null = null;
  if (templateId) {
    template = await prisma.exportTemplate.findUnique({ where: { id: templateId } });
    if (template && template.format !== format) {
      template = null;
    }
  }

  if (!template) {
    template = await prisma.exportTemplate.findFirst({
      where: { format, isDefault: true },
      orderBy: { updatedAt: "desc" },
    });
  }

  const configResult = ExportTemplateConfigSchema.safeParse(template?.config ?? {});
  const config = configResult.success ? configResult.data : ExportTemplateConfigSchema.parse({});

  const hospitalName =
    searchParams.get("hospitalName")?.trim() ||
    template?.hospitalName?.trim() ||
    "Hastane";

  const workingMonth =
    searchParams.get("workingMonth")?.trim() ||
    yearMonthFromDate(period.startDate);

  const parsedMonth = parseYearMonth(workingMonth);
  const monthLabel = parsedMonth
    ? formatMonthLabel(workingMonth, "tr")
    : formatMonthLabel(yearMonthFromDate(period.startDate), "tr");
  const year = parsedMonth?.year ?? period.startDate.getUTCFullYear().toString();

  const titleTemplate =
    template?.titleTemplate ?? "{{hospital}} — {{month}} {{year}} Nöbet Çizelgesi";

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

  const view = (searchParams.get("view") as ExportViewMode | null) ?? config.view;
  const includeSummary =
    searchParams.get("includeSummary") !== "false" && config.includeSummary;
  const includeConflicts =
    searchParams.get("includeConflicts") !== "false" && config.includeConflicts;

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
  };
}