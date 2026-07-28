/**
 * Word (.docx) schedule builder — pure function over already-loaded data.
 *
 * Two entry points, both used by the Word export flow:
 *
 * - `buildWordScheduleBlob` — a complete standalone document (no uploaded
 *   template): cover block + plan table + unfilled section.
 * - `buildWordScheduleAppendBlob` — just the plan table, returned as a `.docx`
 *   `Blob` whose body XML is appended into an uploaded template by
 *   `docx-template.ts`.
 *
 * Both return `Blob`s via `Packer.toBlob` (the browser-safe packer; `toBuffer`
 * is Node-only). Data shape is `ExportInput`/`DetailedAssignment` — ISO strings,
 * not `Date` objects.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { ExportInput, ResolvedExportOptions } from "./types";
import type { DetailedAssignment } from "./types";

interface SchedulePeriodShape {
  name: string;
  startDate: string;
  endDate: string;
}

type AssignmentRow = DetailedAssignment;

const isEn = (locale: "tr" | "en"): boolean => locale === "en";

function formatIsoDate(iso: string, locale: "tr" | "en"): string {
  return new Date(iso).toLocaleDateString(isEn(locale) ? "en-GB" : "tr-TR");
}

function boldCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
    },
    shading: { fill: "E2E8F0" },
  });
}

function plainCell(text: string, shade?: boolean): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text })] })],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
    },
    ...(shade ? { shading: { fill: "F8FAFC" } } : {}),
  });
}

function planHeaderRow(locale: "tr" | "en"): TableRow {
  return new TableRow({
    children: [
      boldCell(isEn(locale) ? "Date" : "Tarih"),
      boldCell(isEn(locale) ? "Location" : "Lokasyon"),
      boldCell(isEn(locale) ? "Shift" : "Vardiya"),
      boldCell(isEn(locale) ? "Assigned" : "Atanan Personel"),
    ],
    tableHeader: true,
  });
}

function planDataRow(a: AssignmentRow, index: number, locale: "tr" | "en"): TableRow {
  const shade = index % 2 !== 0;
  return new TableRow({
    children: [
      plainCell(formatIsoDate(a.date, locale), shade),
      plainCell(a.shiftRequirement?.location?.name ?? "—", shade),
      plainCell(a.shiftRequirement?.shiftTemplate?.name ?? "—", shade),
      plainCell(a.person?.fullName ?? (isEn(locale) ? "— Empty —" : "— Boş —"), shade),
    ],
  });
}

function planTable(
  assignments: AssignmentRow[],
  locale: "tr" | "en"
): Table {
  return new Table({
    rows: [planHeaderRow(locale), ...assignments.map((a, i) => planDataRow(a, i, locale))],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

/**
 * Build a complete Word document as a `Blob`. Mirrors the old
 * `buildWordScheduleBuffer` output (cover block + plan + unfilled section), but
 * takes ISO-string data and uses the browser packer.
 */
export async function buildWordScheduleBlob(
  options: ResolvedExportOptions,
  period: SchedulePeriodShape,
  assignments: AssignmentRow[],
  locale: "tr" | "en"
): Promise<Blob> {
  const startDateStr = formatIsoDate(period.startDate, locale);
  const endDateStr = formatIsoDate(period.endDate, locale);

  const unfilledAssignments = assignments.filter(
    (a) => a.status === "UNFILLED" || a.person === null
  );

  const unfilledHeaderRow = new TableRow({
    children: [
      boldCell(isEn(locale) ? "Date" : "Tarih"),
      boldCell(isEn(locale) ? "Location" : "Lokasyon"),
      boldCell(isEn(locale) ? "Shift" : "Vardiya"),
    ],
    tableHeader: true,
  });

  const unfilledRows = unfilledAssignments.map((a, i) => {
    const shade = i % 2 !== 0;
    return new TableRow({
      children: [
        plainCell(formatIsoDate(a.date, locale), shade),
        plainCell(a.shiftRequirement?.location?.name ?? "—", shade),
        plainCell(a.shiftRequirement?.shiftTemplate?.name ?? "—", shade),
      ],
    });
  });

  const unfilledSection = [
    new Paragraph({
      text: isEn(locale) ? "Unfilled Duties" : "Boş Nöbetler",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400, after: 200 },
    }),
    unfilledAssignments.length === 0
      ? new Paragraph({
          children: [
            new TextRun({
              text: isEn(locale) ? "All duties are assigned." : "Tüm nöbetler atanmıştır.",
              italics: true,
              color: "16A34A",
            }),
          ],
          spacing: { after: 200 },
        })
      : new Table({
          rows: [unfilledHeaderRow, ...unfilledRows],
          width: { size: 100, type: WidthType.PERCENTAGE },
        }),
  ];

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: options.title,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: isEn(locale) ? "Hospital: " : "Hastane: ", bold: true }),
              new TextRun({ text: options.hospitalName }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: isEn(locale) ? "Working Month: " : "Çalışma Ayı: ", bold: true }),
              new TextRun({ text: options.monthLabel }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: isEn(locale) ? "Period: " : "Dönem: ", bold: true }),
              new TextRun({ text: `${startDateStr} – ${endDateStr} (${period.name})` }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: isEn(locale) ? "Total Assignments: " : "Toplam Atama: ", bold: true }),
              new TextRun({ text: String(assignments.length) }),
              new TextRun({ text: isEn(locale) ? "   |   Unfilled: " : "   |   Boş: ", bold: true }),
              new TextRun({
                text: String(unfilledAssignments.length),
                color: unfilledAssignments.length > 0 ? "DC2626" : "16A34A",
              }),
            ],
            spacing: { after: 400 },
          }),
          new Paragraph({
            text: isEn(locale) ? "Duty Plan" : "Nöbet Planı",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 200 },
          }),
          ...(assignments.length === 0
            ? [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: isEn(locale)
                        ? "No assignments for this period."
                        : "Bu dönem için atama bulunmamaktadır.",
                      italics: true,
                      color: "6B7280",
                    }),
                  ],
                  spacing: { after: 200 },
                }),
              ]
            : [planTable(assignments, locale)]),
          ...unfilledSection,
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

/**
 * Build a `.docx` `Blob` containing only the plan table, for appending after an
 * uploaded template's cover page (see `applyPlaceholdersToDocxBuffer`).
 */
export async function buildWordScheduleAppendBlob(
  assignments: AssignmentRow[],
  locale: "tr" | "en"
): Promise<Blob> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: isEn(locale) ? "Duty Plan" : "Nöbet Planı",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
          }),
          ...(assignments.length === 0
            ? [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: isEn(locale)
                        ? "No assignments for this period."
                        : "Bu dönem için atama bulunmamaktadır.",
                      italics: true,
                      color: "6B7280",
                    }),
                  ],
                }),
              ]
            : [planTable(assignments, locale)]),
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

/** Convenience: build the append payload from an `ExportInput`. */
export async function buildWordScheduleAppendFromInput(
  input: ExportInput,
  locale: "tr" | "en"
): Promise<Blob> {
  return buildWordScheduleAppendBlob(input.assignments, locale);
}
