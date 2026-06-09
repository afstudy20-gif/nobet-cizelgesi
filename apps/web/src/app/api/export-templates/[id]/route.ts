import { NextRequest, NextResponse } from "next/server";
import { ExportTemplateUpdateSchema } from "@nobet/shared";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const template = await prisma.exportTemplate.findUnique({ where: { id } });
    if (!template) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Template not found" } },
        { status: 404 }
      );
    }

    const { fileData, ...rest } = template;
    return NextResponse.json({
      ...rest,
      hasFile: Boolean(fileData && fileData.length > 0),
    });
  } catch (err) {
    console.error("[GET /api/export-templates/:id]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await prisma.exportTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Template not found" } },
        { status: 404 }
      );
    }

    const body = await req.json();
    const parsed = ExportTemplateUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
        { status: 400 }
      );
    }

    const data = parsed.data;
    if (data.isDefault) {
      await prisma.exportTemplate.updateMany({
        where: { format: data.format ?? existing.format, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.exportTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.format !== undefined ? { format: data.format } : {}),
        ...(data.hospitalName !== undefined ? { hospitalName: data.hospitalName } : {}),
        ...(data.titleTemplate !== undefined ? { titleTemplate: data.titleTemplate } : {}),
        ...(data.config !== undefined ? { config: data.config } : {}),
        ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
      },
    });

    const { fileData, ...rest } = updated;
    return NextResponse.json({
      ...rest,
      hasFile: Boolean(fileData && fileData.length > 0),
    });
  } catch (err) {
    console.error("[PATCH /api/export-templates/:id]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await prisma.exportTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Template not found" } },
        { status: 404 }
      );
    }
    if (existing.sourceType === "BUILTIN") {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Built-in templates cannot be deleted" } },
        { status: 403 }
      );
    }

    await prisma.exportTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/export-templates/:id]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}