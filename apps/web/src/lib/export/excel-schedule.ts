/**
 * Excel (.xlsx) schedule builder — pure function over already-loaded data.
 *
 * Returns a `Blob` ready for download. The heavy `exceljs` dependency is passed
 * in by the caller (dynamically imported in `index.ts`) so this module does not
 * pull it into the initial bundle and can be unit-tested with a stub.
 *
 * Behaviour mirrors the old `api/periods/[id]/export/excel/route.ts`: same
 * columns, sheet names, ordering, colours and Turkish labels. Dates are ISO
 * strings now; the old `new Date(...)` calls become explicit parsing.
 */

import { calendarDateKey, parseCalendarDate } from "@nobet/scheduler";
import type ExcelJS from "exceljs";
import { base64ToArrayBuffer } from "@/lib/db/repo";
import { applyPlaceholdersToWorkbook } from "./placeholders";
import type { ExportInput, ResolvedExportOptions } from "./types";
import type { DetailedAssignment } from "./types";

export interface ExcelBuilder {
  /** `exceljs` module, supplied by the caller to keep this module bundle-light. */
  ExcelJS: typeof import("exceljs");
}

const dateLocaleFor = (locale: "tr" | "en"): string => (locale === "en" ? "en-GB" : "tr-TR");

/**
 * Build the Excel workbook as a Blob. When `options.template.fileData` is a
 * base64 `.xlsx`, it is loaded as the base workbook and placeholders are
 * applied; otherwise a fresh workbook is created and the plan is rendered onto a
 * new sheet.
 */
export async function buildExcelBlob(
  input: ExportInput,
  options: ResolvedExportOptions,
  builder: ExcelBuilder
): Promise<Blob> {
  const { ExcelJS } = builder;
  const { assignments, conflictLogs } = input;
  const { includeSummary, includeConflicts, view, template, locale } = options;
  const dateLocale = dateLocaleFor(locale);

  const workbook = new ExcelJS.Workbook();
  if (template?.fileData) {
    await workbook.xlsx.load(base64ToArrayBuffer(template.fileData));
    await applyPlaceholdersToWorkbook(workbook, options.placeholderVars);
  } else {
    workbook.creator = "Nöbet Çizelgesi Sistemi";
    workbook.created = new Date();
  }

  const dateSet = new Set<string>();
  for (const a of assignments) dateSet.add(calendarDateKey(new Date(a.date)));
  const dates = Array.from(dateSet).sort();

  const styleHeaderRow = (
    sheet: ExcelJS.Worksheet,
    headers: string[],
    color: string
  ): void => {
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.getColumn(1).width = 22;
    headers.slice(1).forEach((_, i) => {
      sheet.getColumn(i + 2).width = 18;
    });
  };

  const planSheetName =
    view === "person" ? "Kişi Bazlı" : view === "location" ? "Lokasyon Bazlı" : "Plan";
  const planSheet = workbook.addWorksheet(planSheetName);

  if (view === "person") {
    buildPersonView(planSheet, assignments, dates, dateLocale, styleHeaderRow);
  } else if (view === "location") {
    buildLocationView(planSheet, assignments, dates, dateLocale, styleHeaderRow);
  } else {
    buildGridView(planSheet, assignments, dates, dateLocale, styleHeaderRow);
  }

  if (!template?.fileData) {
    addPlanMetadataRows(planSheet, options.title, options.hospitalName, options.monthLabel);
    planSheet.views = [{ state: "frozen", ySplit: 5 }];
  }

  if (includeSummary) buildSummarySheet(workbook, assignments);
  if (includeConflicts) buildConflictsSheet(workbook, assignments, conflictLogs, dateLocale);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function addPlanMetadataRows(
  sheet: ExcelJS.Worksheet,
  title: string,
  hospitalName: string,
  monthLabel: string
): void {
  sheet.insertRow(1, [title]);
  sheet.insertRow(2, [`Hastane: ${hospitalName}`]);
  sheet.insertRow(3, [`Çalışma Ayı: ${monthLabel}`]);
  sheet.insertRow(4, []);
  const titleRow = sheet.getRow(1);
  titleRow.font = { bold: true, size: 14 };
  titleRow.alignment = { vertical: "middle" };
  if (sheet.columnCount > 1) {
    sheet.mergeCells(1, 1, 1, sheet.columnCount);
  }
}

type HeaderStyler = (
  sheet: ExcelJS.Worksheet,
  headers: string[],
  color: string
) => void;

function formatDateHeader(date: string, dateLocale: string): string {
  return parseCalendarDate(date).toLocaleDateString(dateLocale);
}

function buildPersonView(
  planSheet: ExcelJS.Worksheet,
  assignments: DetailedAssignment[],
  dates: string[],
  dateLocale: string,
  styleHeaderRow: HeaderStyler
): void {
  const peopleMap = new Map<string, string>();
  for (const a of assignments) {
    if (a.person) peopleMap.set(a.person.id, a.person.fullName);
  }
  const people = Array.from(peopleMap.entries()).sort((a, b) =>
    a[1].localeCompare(b[1], "tr")
  );

  const lookup: Record<string, Record<string, string[]>> = {};
  for (const a of assignments) {
    if (!a.person || !a.shiftRequirement) continue;
    const d = calendarDateKey(new Date(a.date));
    const label = `${a.shiftRequirement.location?.name ?? "—"} / ${a.shiftRequirement.shiftTemplate?.code ?? "—"}`;
    (lookup[a.person.id] ??= {})[d] ??= [];
    lookup[a.person.id][d].push(label);
  }

  styleHeaderRow(
    planSheet,
    ["Personel", ...dates.map((d) => formatDateHeader(d, dateLocale))],
    "FF059669"
  );

  people.forEach(([personId, name], rowIdx) => {
    const row = planSheet.addRow([
      name,
      ...dates.map((d) => (lookup[personId]?.[d] ?? []).join(", ") || "—"),
    ]);
    const bgColor = rowIdx % 2 === 0 ? "FFFFFFFF" : "FFF0FDF4";
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
    });
  });
}

function buildLocationView(
  planSheet: ExcelJS.Worksheet,
  assignments: DetailedAssignment[],
  dates: string[],
  dateLocale: string,
  styleHeaderRow: HeaderStyler
): void {
  const locMap = new Map<string, string>();
  for (const a of assignments) {
    if (!a.shiftRequirement?.location) continue;
    locMap.set(a.shiftRequirement.location.id, a.shiftRequirement.location.name);
  }
  const locations = Array.from(locMap.entries()).sort((a, b) =>
    a[1].localeCompare(b[1], "tr")
  );

  const lookup: Record<string, Record<string, string[]>> = {};
  for (const a of assignments) {
    const locId = a.shiftRequirement?.location?.id;
    if (!locId) continue;
    const d = calendarDateKey(new Date(a.date));
    const label = `${a.shiftRequirement?.shiftTemplate?.code ?? "—"}: ${a.person?.fullName ?? "BOŞ"}`;
    (lookup[locId] ??= {})[d] ??= [];
    lookup[locId][d].push(label);
  }

  styleHeaderRow(
    planSheet,
    ["Lokasyon", ...dates.map((d) => formatDateHeader(d, dateLocale))],
    "FF7C3AED"
  );

  locations.forEach(([locId, name], rowIdx) => {
    const row = planSheet.addRow([
      name,
      ...dates.map((d) => (lookup[locId]?.[d] ?? []).join(", ") || "—"),
    ]);
    const bgColor = rowIdx % 2 === 0 ? "FFFFFFFF" : "FFF5F3FF";
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
    });
  });
}

function buildGridView(
  planSheet: ExcelJS.Worksheet,
  assignments: DetailedAssignment[],
  dates: string[],
  dateLocale: string,
  styleHeaderRow: HeaderStyler
): void {
  type ColKey = { locationId: string; shiftTemplateId: string; label: string };
  const colKeyMap = new Map<string, ColKey>();
  for (const a of assignments) {
    const locId = a.shiftRequirement?.location?.id;
    const tmplId = a.shiftRequirement?.shiftTemplate?.id;
    if (!locId || !tmplId) continue;
    const req = a.shiftRequirement;
    const key = `${locId}__${tmplId}`;
    if (req && !colKeyMap.has(key)) {
      colKeyMap.set(key, {
        locationId: locId,
        shiftTemplateId: tmplId,
        label: `${req.location?.name ?? "—"} / ${req.shiftTemplate?.name ?? "—"}`,
      });
    }
  }
  const colKeys = Array.from(colKeyMap.values());

  styleHeaderRow(planSheet, ["Tarih", ...colKeys.map((c) => c.label)], "FF2563EB");
  planSheet.getColumn(1).width = 14;
  colKeys.forEach((_, i) => {
    planSheet.getColumn(i + 2).width = 24;
  });

  const planLookup: Record<string, Record<string, string[]>> = {};
  for (const a of assignments) {
    const locId = a.shiftRequirement?.location?.id;
    const tmplId = a.shiftRequirement?.shiftTemplate?.id;
    if (!locId || !tmplId) continue;
    const d = calendarDateKey(new Date(a.date));
    const k = `${locId}__${tmplId}`;
    (planLookup[d] ??= {})[k] ??= [];
    planLookup[d][k].push(a.person?.fullName ?? "BOŞ");
  }

  dates.forEach((date, rowIdx) => {
    const displayDate = formatDateHeader(date, dateLocale);
    const row = planSheet.addRow([
      displayDate,
      ...colKeys.map((col) => {
        const key = `${col.locationId}__${col.shiftTemplateId}`;
        const names = planLookup[date]?.[key];
        if (!names || names.length === 0) return "BOŞ";
        return names.join(", ");
      }),
    ]);
    const bgColor = rowIdx % 2 === 0 ? "FFFFFFFF" : "FFF1F5F9";
    row.eachCell((cell, colNumber) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      cell.alignment = { vertical: "middle" };
      if (colNumber > 1 && cell.value === "BOŞ") {
        cell.font = { color: { argb: "FFDC2626" }, italic: true };
      }
    });
  });
}

function buildSummarySheet(
  workbook: ExcelJS.Workbook,
  assignments: DetailedAssignment[]
): void {
  const summarySheet = workbook.addWorksheet("Kişi Özeti");

  const summaryHeaders = ["Personel", "Toplam", "Gece", "Hafta Sonu"];
  const summaryHeaderRow = summarySheet.addRow(summaryHeaders);
  summaryHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  summarySheet.views = [{ state: "frozen", ySplit: 1 }];
  summarySheet.getColumn(1).width = 28;
  summarySheet.getColumn(2).width = 10;
  summarySheet.getColumn(3).width = 10;
  summarySheet.getColumn(4).width = 12;

  type PersonStats = { fullName: string; total: number; night: number; weekend: number };
  const personStats = new Map<string, PersonStats>();

  for (const a of assignments) {
    if (!a.person) continue;
    const existing = personStats.get(a.person.id);
    const stats: PersonStats = existing ?? {
      fullName: a.person.fullName,
      total: 0,
      night: 0,
      weekend: 0,
    };
    stats.total++;
    if (a.shiftRequirement?.shiftTemplate?.isNightShift) stats.night++;
    const dayOfWeek = parseCalendarDate(calendarDateKey(new Date(a.date))).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) stats.weekend++;
    personStats.set(a.person.id, stats);
  }

  const sortedPeople = Array.from(personStats.values()).sort((a, b) =>
    a.fullName.localeCompare(b.fullName, "tr")
  );

  sortedPeople.forEach((s, i) => {
    const row = summarySheet.addRow([s.fullName, s.total, s.night, s.weekend]);
    const bgColor = i % 2 === 0 ? "FFFFFFFF" : "FFF0FDF4";
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      cell.alignment = { vertical: "middle" };
    });
  });
}

function buildConflictsSheet(
  workbook: ExcelJS.Workbook,
  assignments: DetailedAssignment[],
  conflictLogs: ExportInput["conflictLogs"],
  dateLocale: string
): void {
  const conflictsSheet = workbook.addWorksheet("Çakışmalar");

  const conflictHeaders = ["Tarih", "Lokasyon", "Vardiya", "Durum", "Tür", "Önem", "Mesaj"];
  const conflictHeaderRow = conflictsSheet.addRow(conflictHeaders);
  conflictHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDC2626" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  conflictsSheet.views = [{ state: "frozen", ySplit: 1 }];
  conflictsSheet.columns = [
    { key: "date", width: 14 },
    { key: "location", width: 20 },
    { key: "shift", width: 18 },
    { key: "status", width: 12 },
    { key: "type", width: 20 },
    { key: "severity", width: 10 },
    { key: "message", width: 50 },
  ];

  const unfilledAssignments = assignments.filter(
    (a) => a.status === "UNFILLED" || a.person === null
  );
  unfilledAssignments.forEach((a, i) => {
    const row = conflictsSheet.addRow([
      parseCalendarDate(calendarDateKey(new Date(a.date))).toLocaleDateString(dateLocale),
      a.shiftRequirement?.location?.name ?? "—",
      a.shiftRequirement?.shiftTemplate?.name ?? "—",
      "BOŞ",
      "UNFILLED",
      "—",
      "Atama yapılmadı",
    ]);
    const bgColor = i % 2 === 0 ? "FFFEF2F2" : "FFFFFFFF";
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
    });
  });

  conflictLogs.forEach((log, i) => {
    const row = conflictsSheet.addRow([
      "—",
      "—",
      "—",
      "—",
      log.type,
      log.severity,
      log.message,
    ]);
    const bgColor =
      log.severity === "ERROR"
        ? "FFFEF2F2"
        : i % 2 === 0
          ? "FFFEFCE8"
          : "FFFFFFFF";
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
    });
  });
}
