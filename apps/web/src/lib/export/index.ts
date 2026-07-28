/**
 * Export entry point — the single function the export page calls.
 *
 * `exportSchedule` loads the period + assignments + conflicts via the repository
 * layer, resolves export options (template by id or default), builds the output
 * with a format-specific builder, and triggers a download (or opens a print
 * window for PDF).
 *
 * The heavy libraries (`exceljs`, `docx`) are imported dynamically inside each
 * handler so they stay out of the page's initial bundle — they are large and
 * most users only press an export button once.
 */

import { base64ToArrayBuffer, exportTemplatesRepo, schedulePeriodsRepo } from "@/lib/db/repo";
import { buildExportFilename, resolveExportOptions } from "./resolve-options";
import { buildPdfHtml } from "./pdf-schedule";
import { buildWordScheduleAppendBlob, buildWordScheduleBlob } from "./word-schedule";
import { applyPlaceholdersToDocxBuffer } from "./docx-template";
import { downloadBlob, openPrintWindow } from "./download";
import type { ExportTemplate } from "@/lib/db/types";
import type { ExportFormat, ExportOverrides } from "./types";

/**
 * Resolve which template to use for a format: an explicit `templateId` override
 * (must match the format), else the format default, else `null`.
 */
async function resolveTemplate(
  format: ExportFormat,
  templateId?: string
): Promise<ExportTemplate | null> {
  if (templateId) {
    const explicit = await exportTemplatesRepo.get(templateId);
    if (explicit && explicit.format === format) return explicit;
  }
  return exportTemplatesRepo.getDefault(format);
}

/** Load all the plain data a builder needs, in one pass. */
async function loadExportData(periodId: string) {
  return schedulePeriodsRepo.getExportData(periodId, true);
}

/**
 * Export a schedule period in the given format. Throws on not-found / data
 * errors (the page surfaces these to the user).
 *
 * - `EXCEL` / `WORD`: builds a `Blob` and downloads it.
 * - `PDF`: builds an HTML document and opens it in a new window for the browser
 *   print dialog. If the popup is blocked, falls back to downloading the HTML.
 */
export async function exportSchedule(
  periodId: string,
  format: ExportFormat,
  overrides: ExportOverrides & { templateId?: string } = {}
): Promise<void> {
  const data = await loadExportData(periodId);
  const template = await resolveTemplate(format, overrides.templateId);
  const options = resolveExportOptions(data.period, template, overrides, format);
  const filename = buildExportFilename(format, options);

  if (format === "EXCEL") {
    const blob = await buildExcel(data, options);
    downloadBlob(blob, filename);
    return;
  }

  if (format === "WORD") {
    const blob = await buildWord(data, options, overrides.locale ?? "tr");
    downloadBlob(blob, filename);
    return;
  }

  // PDF: HTML → print window.
  const html = buildPdfHtml(data, options);
  const win = openPrintWindow(html);
  if (!win) {
    // Popup blocked: fall back to downloading the HTML so the user isn't stuck.
    downloadBlob(new Blob([html], { type: "text/html; charset=utf-8" }), filename);
  }
}

/** Excel builder wrapper: dynamically import `exceljs` so it's not in the page bundle. */
async function buildExcel(
  data: Awaited<ReturnType<typeof loadExportData>>,
  options: ReturnType<typeof resolveExportOptions>
): Promise<Blob> {
  const { buildExcelBlob } = await import("./excel-schedule");
  const ExcelJS = await import("exceljs");
  return buildExcelBlob(data, options, { ExcelJS });
}

/** Word builder wrapper: dynamically import `docx` and pick template-fill path. */
async function buildWord(
  data: Awaited<ReturnType<typeof loadExportData>>,
  options: ReturnType<typeof resolveExportOptions>,
  locale: "tr" | "en"
): Promise<Blob> {
  // `docx` is imported by word-schedule.ts directly; ensure it loads.
  await import("docx");

  if (options.template?.fileData) {
    const templateBuffer = base64ToArrayBuffer(options.template.fileData);
    const appendBlob = await buildWordScheduleAppendBlob(data.assignments, locale);
    return applyPlaceholdersToDocxBuffer(templateBuffer, options.placeholderVars, appendBlob);
  }
  return buildWordScheduleBlob(options, data.period, data.assignments, locale);
}
