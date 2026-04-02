import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id: periodId } = await params;
    const { searchParams } = new URL(req.url);
    const includeSummary = searchParams.get("includeSummary") !== "false";
    const includeConflicts = searchParams.get("includeConflicts") !== "false";

    // Load period
    const period = await prisma.schedulePeriod.findUnique({
      where: { id: periodId },
      include: {
        requirements: {
          include: {
            shiftTemplate: true,
            location: true,
          },
        },
      },
    });

    if (!period) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Period not found" } },
        { status: 404 }
      );
    }

    // Load assignments
    const assignments = await prisma.assignment.findMany({
      where: { periodId },
      include: {
        person: {
          select: { id: true, fullName: true, firstName: true, lastName: true },
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

    // Load conflict logs
    const conflictLogs = await prisma.conflictLog.findMany({
      where: { periodId },
      orderBy: { createdAt: "asc" },
    });

    // ─── Build workbook ────────────────────────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Nöbet Çizelgesi Sistemi";
    workbook.created = new Date();

    // ── Sheet 1: Plan ──────────────────────────────────────────────────────
    const planSheet = workbook.addWorksheet("Plan");

    // Unique dates
    const dateSet = new Set<string>();
    for (const a of assignments) {
      dateSet.add(a.date.toISOString().split("T")[0]);
    }
    const dates = Array.from(dateSet).sort();

    // Unique (locationId + shiftTemplateId) columns
    type ColKey = { locationId: string; shiftTemplateId: string; label: string };
    const colKeyMap = new Map<string, ColKey>();
    for (const a of assignments) {
      const key = `${a.shiftRequirement.location.id}__${a.shiftRequirement.shiftTemplate.id}`;
      if (!colKeyMap.has(key)) {
        colKeyMap.set(key, {
          locationId: a.shiftRequirement.location.id,
          shiftTemplateId: a.shiftRequirement.shiftTemplate.id,
          label: `${a.shiftRequirement.location.name} / ${a.shiftRequirement.shiftTemplate.name}`,
        });
      }
    }
    const colKeys = Array.from(colKeyMap.values());

    // Header row
    const planHeaders = ["Tarih", ...colKeys.map((c) => c.label)];
    const planHeaderRow = planSheet.addRow(planHeaders);
    planHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFBFDBFE" } },
      };
    });
    planSheet.views = [{ state: "frozen", ySplit: 1 }];

    // Set column widths
    planSheet.getColumn(1).width = 14;
    colKeys.forEach((_, i) => {
      planSheet.getColumn(i + 2).width = 24;
    });

    // Build lookup: date -> colKey -> person names
    const planLookup: Record<string, Record<string, string[]>> = {};
    for (const a of assignments) {
      const d = a.date.toISOString().split("T")[0];
      const k = `${a.shiftRequirement.location.id}__${a.shiftRequirement.shiftTemplate.id}`;
      if (!planLookup[d]) planLookup[d] = {};
      if (!planLookup[d][k]) planLookup[d][k] = [];
      planLookup[d][k].push(a.person?.fullName ?? "BOŞ");
    }

    // Data rows with alternating colors
    dates.forEach((date, rowIdx) => {
      const displayDate = new Date(date + "T00:00:00").toLocaleDateString("tr-TR");
      const rowData = [
        displayDate,
        ...colKeys.map((col) => {
          const key = `${col.locationId}__${col.shiftTemplateId}`;
          const names = planLookup[date]?.[key];
          if (!names || names.length === 0) return "BOŞ";
          return names.join(", ");
        }),
      ];

      const row = planSheet.addRow(rowData);
      const bgColor = rowIdx % 2 === 0 ? "FFFFFFFF" : "FFF1F5F9";

      row.eachCell((cell, colNumber) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
        cell.alignment = { vertical: "middle" };
        if (colNumber > 1) {
          const val = cell.value as string;
          if (val === "BOŞ") {
            cell.font = { color: { argb: "FFDC2626" }, italic: true };
          }
        }
      });
    });

    // ── Sheet 2: Kişi Özeti (if includeSummary) ───────────────────────────
    if (includeSummary) {
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

      // Aggregate per person
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
        if (a.shiftRequirement.shiftTemplate.isNightShift) stats.night++;
        const dayOfWeek = new Date(a.date).getDay(); // 0=Sun, 6=Sat
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

    // ── Sheet 3: Çakışmalar (if includeConflicts) ─────────────────────────
    if (includeConflicts) {
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

      // Unfilled assignments
      const unfilledAssignments = assignments.filter(
        (a) => a.status === "UNFILLED" || a.person === null
      );
      unfilledAssignments.forEach((a, i) => {
        const row = conflictsSheet.addRow([
          new Date(a.date).toLocaleDateString("tr-TR"),
          a.shiftRequirement.location.name,
          a.shiftRequirement.shiftTemplate.name,
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

      // Conflict logs
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

    // ─── Generate buffer and return ────────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer();

    const startMonth = period.startDate.toISOString().slice(0, 7);
    const filename = `nobet-plani-${startMonth}.xlsx`;

    return new Response(new Uint8Array(buffer as ArrayBuffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[GET /api/periods/:id/export/excel]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
