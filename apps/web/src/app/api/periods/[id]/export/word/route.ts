import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

type Params = { params: Promise<{ id: string }> };

// ─── Helpers ────────────────────────────────────────────────────────────────

function boldCell(text: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true })],
      }),
    ],
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
    children: [
      new Paragraph({
        children: [new TextRun({ text })],
      }),
    ],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
    },
    ...(shade ? { shading: { fill: "F8FAFC" } } : {}),
  });
}

// ─── Route ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id: periodId } = await params;

    // Load period
    const period = await prisma.schedulePeriod.findUnique({
      where: { id: periodId },
    });

    if (!period) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Period not found" } },
        { status: 404 }
      );
    }

    // Load assignments with relations
    const assignments = await prisma.assignment.findMany({
      where: { periodId },
      include: {
        person: {
          select: { fullName: true },
        },
        shiftRequirement: {
          include: {
            shiftTemplate: true,
            location: true,
          },
        },
      },
      orderBy: [{ date: "asc" }, { startDateTime: "asc" }],
    });

    const startDateStr = period.startDate.toLocaleDateString("tr-TR");
    const endDateStr = period.endDate.toLocaleDateString("tr-TR");
    const startMonth = period.startDate.toISOString().slice(0, 7);

    // ─── Main assignments table ──────────────────────────────────────────
    const tableHeaderRow = new TableRow({
      children: [
        boldCell("Tarih"),
        boldCell("Lokasyon"),
        boldCell("Vardiya"),
        boldCell("Atanan Personel"),
      ],
      tableHeader: true,
    });

    const dataRows = assignments.map((a, i) => {
      const shade = i % 2 !== 0;
      return new TableRow({
        children: [
          plainCell(new Date(a.date).toLocaleDateString("tr-TR"), shade),
          plainCell(a.shiftRequirement.location.name, shade),
          plainCell(a.shiftRequirement.shiftTemplate.name, shade),
          plainCell(a.person?.fullName ?? "— Boş —", shade),
        ],
      });
    });

    const assignmentsTable = new Table({
      rows: [tableHeaderRow, ...dataRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
    });

    // ─── Unfilled assignments section ────────────────────────────────────
    const unfilledAssignments = assignments.filter(
      (a) => a.status === "UNFILLED" || a.person === null
    );

    const unfilledHeaderRow = new TableRow({
      children: [boldCell("Tarih"), boldCell("Lokasyon"), boldCell("Vardiya")],
      tableHeader: true,
    });

    const unfilledRows = unfilledAssignments.map((a, i) => {
      const shade = i % 2 !== 0;
      return new TableRow({
        children: [
          plainCell(new Date(a.date).toLocaleDateString("tr-TR"), shade),
          plainCell(a.shiftRequirement.location.name, shade),
          plainCell(a.shiftRequirement.shiftTemplate.name, shade),
        ],
      });
    });

    const unfilledSection = [
      new Paragraph({
        text: "Boş Nöbetler",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 200 },
      }),
      unfilledAssignments.length === 0
        ? new Paragraph({
            children: [
              new TextRun({
                text: "Tüm nöbetler atanmıştır.",
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

    // ─── Document ────────────────────────────────────────────────────────
    const doc = new Document({
      sections: [
        {
          children: [
            // Title
            new Paragraph({
              text: period.name,
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
              spacing: { after: 300 },
            }),

            // Period info
            new Paragraph({
              children: [
                new TextRun({ text: "Dönem: ", bold: true }),
                new TextRun({ text: `${startDateStr} – ${endDateStr}` }),
              ],
              spacing: { after: 100 },
            }),
            new Paragraph({
              children: [
                new TextRun({ text: "Toplam Atama: ", bold: true }),
                new TextRun({ text: String(assignments.length) }),
                new TextRun({ text: "   |   Boş: ", bold: true }),
                new TextRun({
                  text: String(unfilledAssignments.length),
                  color: unfilledAssignments.length > 0 ? "DC2626" : "16A34A",
                }),
              ],
              spacing: { after: 400 },
            }),

            // Assignments heading
            new Paragraph({
              text: "Nöbet Planı",
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 200, after: 200 },
            }),

            // Assignments table
            ...(assignments.length === 0
              ? [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: "Bu dönem için atama bulunmamaktadır.",
                        italics: true,
                        color: "6B7280",
                      }),
                    ],
                    spacing: { after: 200 },
                  }),
                ]
              : [assignmentsTable]),

            // Unfilled section
            ...unfilledSection,
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `nobet-raporu-${startMonth}.docx`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[GET /api/periods/:id/export/word]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
