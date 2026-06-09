import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveExportOptions } from "@/lib/export/resolve-options";
import { applyPlaceholdersToDocxBuffer } from "@/lib/export/docx-template";
import {
  buildWordScheduleAppendBuffer,
  buildWordScheduleBuffer,
} from "@/lib/export/word-schedule";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id: periodId } = await params;
    const locale = req.nextUrl.searchParams.get("locale") === "en" ? "en-GB" : "tr-TR";

    const period = await prisma.schedulePeriod.findUnique({
      where: { id: periodId },
    });

    if (!period) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Period not found" } },
        { status: 404 }
      );
    }

    const options = await resolveExportOptions(req.nextUrl.searchParams, period, "WORD");

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

    let buffer: Buffer;

    if (options.template?.fileData) {
      const scheduleAppend = await buildWordScheduleAppendBuffer(assignments, locale);
      buffer = await applyPlaceholdersToDocxBuffer(
        Buffer.from(options.template.fileData),
        options.placeholderVars,
        scheduleAppend
      );
    } else {
      buffer = await buildWordScheduleBuffer(options, period, assignments, locale);
    }

    const filename = `nobet-raporu-${options.workingMonth}.docx`;

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