import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";
import { calendarDateKey } from "@nobet/scheduler";
import { resolveExportOptions } from "@/lib/export/resolve-options";
import { applyPlaceholdersToWorkbook } from "@/lib/export/placeholders";

type Params = { params: Promise<{ id: string }> };

function addPlanMetadataRows(sheet: ExcelJS.Worksheet, title: string, hospitalName: string, monthLabel: string) {
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

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id: periodId } = await params;

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

    const options = await resolveExportOptions(req.nextUrl.searchParams, period, "EXCEL");
    const { includeSummary, includeConflicts, view } = options;

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
    if (options.template?.fileData) {
      // ExcelJS Buffer type differs from Node Buffer in strict TS builds
      await workbook.xlsx.load(Buffer.from(options.template.fileData) as never);
      await applyPlaceholdersToWorkbook(workbook, options.placeholderVars);
    } else {
      workbook.creator = "Nöbet Çizelgesi Sistemi";
      workbook.created = new Date();
    }

    const dateSet = new Set<string>();
    for (const a of assignments) {
      dateSet.add(calendarDateKey(a.date));
    }
    const dates = Array.from(dateSet).sort();

    const styleHeaderRow = (
      sheet: ExcelJS.Worksheet,
      headers: string[],
      color: string
    ) => {
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
      const peopleMap = new Map<string, string>();
      for (const a of assignments) {
        if (a.person) peopleMap.set(a.person.id, a.person.fullName);
      }
      const people = Array.from(peopleMap.entries()).sort((a, b) =>
        a[1].localeCompare(b[1], "tr")
      );

      const lookup: Record<string, Record<string, string[]>> = {};
      for (const a of assignments) {
        if (!a.person) continue;
        const d = calendarDateKey(a.date);
        const label = `${a.shiftRequirement.location.name} / ${a.shiftRequirement.shiftTemplate.code}`;
        (lookup[a.person.id] ??= {})[d] ??= [];
        lookup[a.person.id][d].push(label);
      }

      styleHeaderRow(
        planSheet,
        ["Personel", ...dates.map((d) => new Date(d + "T12:00:00Z").toLocaleDateString("tr-TR"))],
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
    } else if (view === "location") {
      const locMap = new Map<string, string>();
      for (const a of assignments) {
        locMap.set(
          a.shiftRequirement.location.id,
          a.shiftRequirement.location.name
        );
      }
      const locations = Array.from(locMap.entries()).sort((a, b) =>
        a[1].localeCompare(b[1], "tr")
      );

      const lookup: Record<string, Record<string, string[]>> = {};
      for (const a of assignments) {
        const locId = a.shiftRequirement.location.id;
        const d = calendarDateKey(a.date);
        const label = `${a.shiftRequirement.shiftTemplate.code}: ${a.person?.fullName ?? "BOŞ"}`;
        (lookup[locId] ??= {})[d] ??= [];
        lookup[locId][d].push(label);
      }

      styleHeaderRow(
        planSheet,
        ["Lokasyon", ...dates.map((d) => new Date(d + "T12:00:00Z").toLocaleDateString("tr-TR"))],
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
    } else {
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

      styleHeaderRow(
        planSheet,
        ["Tarih", ...colKeys.map((c) => c.label)],
        "FF2563EB"
      );
      planSheet.getColumn(1).width = 14;
      colKeys.forEach((_, i) => {
        planSheet.getColumn(i + 2).width = 24;
      });

      const planLookup: Record<string, Record<string, string[]>> = {};
      for (const a of assignments) {
        const d = calendarDateKey(a.date);
        const k = `${a.shiftRequirement.location.id}__${a.shiftRequirement.shiftTemplate.id}`;
        (planLookup[d] ??= {})[k] ??= [];
        planLookup[d][k].push(a.person?.fullName ?? "BOŞ");
      }

      dates.forEach((date, rowIdx) => {
        const displayDate = new Date(date + "T12:00:00Z").toLocaleDateString("tr-TR");
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

    if (!options.template?.fileData) {
      addPlanMetadataRows(
        planSheet,
        options.title,
        options.hospitalName,
        options.monthLabel
      );
      planSheet.views = [{ state: "frozen", ySplit: 5 }];
    }

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

    const hospitalSlug = options.hospitalName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    const filename = `nobet-plani-${options.workingMonth}${hospitalSlug ? `-${hospitalSlug}` : ""}.xlsx`;

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
