import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const template = await prisma.exportTemplate.findUnique({ where: { id } });
    if (!template) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Template not found" } },
        { status: 404 }
      );
    }

    if (template.format !== "EXCEL") {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Only Excel templates support file upload" } },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "file is required" } },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Only .xlsx files are supported" } },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "File must be 5 MB or smaller" } },
        { status: 400 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const updated = await prisma.exportTemplate.update({
      where: { id },
      data: {
        fileName: file.name,
        fileData: bytes,
        sourceType: "UPLOADED",
      },
    });

    const { fileData, ...rest } = updated;
    return NextResponse.json({
      ...rest,
      hasFile: Boolean(fileData && fileData.length > 0),
    });
  } catch (err) {
    console.error("[POST /api/export-templates/:id/upload]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}