import {
  Document,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  Packer,
  AlignmentType,
  BorderStyle,
  WidthType,
} from "docx";
import type { ResolvedExportOptions } from "./resolve-options";

type AssignmentRow = {
  date: Date;
  status: string;
  person: { fullName: string } | null;
  shiftRequirement: {
    location: { name: string };
    shiftTemplate: { name: string };
  };
};

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

export async function buildWordScheduleBuffer(
  options: ResolvedExportOptions,
  period: { name: string; startDate: Date; endDate: Date },
  assignments: AssignmentRow[],
  locale: string
): Promise<Buffer> {
  const dateFmt = (d: Date) => d.toLocaleDateString(locale);
  const startDateStr = dateFmt(period.startDate);
  const endDateStr = dateFmt(period.endDate);

  const tableHeaderRow = new TableRow({
    children: [
      boldCell(locale.startsWith("en") ? "Date" : "Tarih"),
      boldCell(locale.startsWith("en") ? "Location" : "Lokasyon"),
      boldCell(locale.startsWith("en") ? "Shift" : "Vardiya"),
      boldCell(locale.startsWith("en") ? "Assigned" : "Atanan Personel"),
    ],
    tableHeader: true,
  });

  const dataRows = assignments.map((a, i) => {
    const shade = i % 2 !== 0;
    return new TableRow({
      children: [
        plainCell(dateFmt(new Date(a.date)), shade),
        plainCell(a.shiftRequirement.location.name, shade),
        plainCell(a.shiftRequirement.shiftTemplate.name, shade),
        plainCell(a.person?.fullName ?? (locale.startsWith("en") ? "— Empty —" : "— Boş —"), shade),
      ],
    });
  });

  const assignmentsTable = new Table({
    rows: [tableHeaderRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });

  const unfilledAssignments = assignments.filter(
    (a) => a.status === "UNFILLED" || a.person === null
  );

  const unfilledHeaderRow = new TableRow({
    children: [
      boldCell(locale.startsWith("en") ? "Date" : "Tarih"),
      boldCell(locale.startsWith("en") ? "Location" : "Lokasyon"),
      boldCell(locale.startsWith("en") ? "Shift" : "Vardiya"),
    ],
    tableHeader: true,
  });

  const unfilledRows = unfilledAssignments.map((a, i) => {
    const shade = i % 2 !== 0;
    return new TableRow({
      children: [
        plainCell(dateFmt(new Date(a.date)), shade),
        plainCell(a.shiftRequirement.location.name, shade),
        plainCell(a.shiftRequirement.shiftTemplate.name, shade),
      ],
    });
  });

  const unfilledSection = [
    new Paragraph({
      text: locale.startsWith("en") ? "Unfilled Duties" : "Boş Nöbetler",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400, after: 200 },
    }),
    unfilledAssignments.length === 0
      ? new Paragraph({
          children: [
            new TextRun({
              text: locale.startsWith("en")
                ? "All duties are assigned."
                : "Tüm nöbetler atanmıştır.",
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
              new TextRun({
                text: locale.startsWith("en") ? "Hospital: " : "Hastane: ",
                bold: true,
              }),
              new TextRun({ text: options.hospitalName }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: locale.startsWith("en") ? "Working Month: " : "Çalışma Ayı: ",
                bold: true,
              }),
              new TextRun({ text: options.monthLabel }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: locale.startsWith("en") ? "Period: " : "Dönem: ", bold: true }),
              new TextRun({ text: `${startDateStr} – ${endDateStr} (${period.name})` }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: locale.startsWith("en") ? "Total Assignments: " : "Toplam Atama: ",
                bold: true,
              }),
              new TextRun({ text: String(assignments.length) }),
              new TextRun({
                text: locale.startsWith("en") ? "   |   Unfilled: " : "   |   Boş: ",
                bold: true,
              }),
              new TextRun({
                text: String(unfilledAssignments.length),
                color: unfilledAssignments.length > 0 ? "DC2626" : "16A34A",
              }),
            ],
            spacing: { after: 400 },
          }),
          new Paragraph({
            text: locale.startsWith("en") ? "Duty Plan" : "Nöbet Planı",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 200 },
          }),
          ...(assignments.length === 0
            ? [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: locale.startsWith("en")
                        ? "No assignments for this period."
                        : "Bu dönem için atama bulunmamaktadır.",
                      italics: true,
                      color: "6B7280",
                    }),
                  ],
                  spacing: { after: 200 },
                }),
              ]
            : [assignmentsTable]),
          ...unfilledSection,
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

/** Schedule-only body for appending after an uploaded Word template cover page. */
export async function buildWordScheduleAppendBuffer(
  assignments: AssignmentRow[],
  locale: string
): Promise<Buffer> {
  const dateFmt = (d: Date) => d.toLocaleDateString(locale);

  const tableHeaderRow = new TableRow({
    children: [
      boldCell(locale.startsWith("en") ? "Date" : "Tarih"),
      boldCell(locale.startsWith("en") ? "Location" : "Lokasyon"),
      boldCell(locale.startsWith("en") ? "Shift" : "Vardiya"),
      boldCell(locale.startsWith("en") ? "Assigned" : "Atanan Personel"),
    ],
    tableHeader: true,
  });

  const dataRows = assignments.map((a, i) => {
    const shade = i % 2 !== 0;
    return new TableRow({
      children: [
        plainCell(dateFmt(new Date(a.date)), shade),
        plainCell(a.shiftRequirement.location.name, shade),
        plainCell(a.shiftRequirement.shiftTemplate.name, shade),
        plainCell(a.person?.fullName ?? (locale.startsWith("en") ? "— Empty —" : "— Boş —"), shade),
      ],
    });
  });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: locale.startsWith("en") ? "Duty Plan" : "Nöbet Planı",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
          }),
          ...(assignments.length === 0
            ? [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: locale.startsWith("en")
                        ? "No assignments for this period."
                        : "Bu dönem için atama bulunmamaktadır.",
                      italics: true,
                      color: "6B7280",
                    }),
                  ],
                }),
              ]
            : [
                new Table({
                  rows: [tableHeaderRow, ...dataRows],
                  width: { size: 100, type: WidthType.PERCENTAGE },
                }),
              ]),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}