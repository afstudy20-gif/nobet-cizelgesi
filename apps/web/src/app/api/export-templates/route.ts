import { NextRequest, NextResponse } from "next/server";
import { ExportTemplateCreateSchema } from "@nobet/shared";
import { prisma } from "@/lib/prisma";

function serializeTemplate(template: {
  id: string;
  name: string;
  description: string | null;
  format: string;
  sourceType: string;
  hospitalName: string | null;
  titleTemplate: string;
  config: unknown;
  fileName: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...template,
    hasFile: false,
  };
}

export async function GET(req: NextRequest) {
  try {
    const format = req.nextUrl.searchParams.get("format");
    const templates = await prisma.exportTemplate.findMany({
      where: format ? { format: format as "EXCEL" | "WORD" | "PDF" } : undefined,
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        format: true,
        sourceType: true,
        hospitalName: true,
        titleTemplate: true,
        config: true,
        fileName: true,
        fileData: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      templates.map(({ fileData, ...rest }) => ({
        ...rest,
        hasFile: Boolean(fileData && fileData.length > 0),
      }))
    );
  } catch (err) {
    console.error("[GET /api/export-templates]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = ExportTemplateCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
        { status: 400 }
      );
    }

    const data = parsed.data;

    if (data.isDefault) {
      await prisma.exportTemplate.updateMany({
        where: { format: data.format, isDefault: true },
        data: { isDefault: false },
      });
    }

    const created = await prisma.exportTemplate.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        format: data.format,
        sourceType: "CUSTOM",
        hospitalName: data.hospitalName ?? null,
        titleTemplate:
          data.titleTemplate ?? "{{hospital}} — {{month}} {{year}} Nöbet Çizelgesi",
        config: data.config ?? {},
        isDefault: data.isDefault ?? false,
      },
    });

    return NextResponse.json(serializeTemplate(created), { status: 201 });
  } catch (err) {
    console.error("[POST /api/export-templates]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}