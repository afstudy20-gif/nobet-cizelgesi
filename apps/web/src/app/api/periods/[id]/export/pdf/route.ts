import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calendarDateKey } from "@nobet/scheduler";
import { resolveExportOptions } from "@/lib/export/resolve-options";

type Params = { params: Promise<{ id: string }> };

// HTML-based PDF: returns a print-ready landscape page that auto-triggers the
// browser print dialog. The user chooses "Save as PDF". This matches the
// EXPORTS.md preference (HTML template → easier layout control) and needs no
// headless-browser dependency.

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id: periodId } = await params;
    const period = await prisma.schedulePeriod.findUnique({
      where: { id: periodId },
    });

    if (!period) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Period not found" } },
        { status: 404 }
      );
    }

    const options = await resolveExportOptions(req.nextUrl.searchParams, period, "PDF");
    const { includeSummary, includeConflicts, view } = options;

    const assignments = await prisma.assignment.findMany({
      where: { periodId },
      include: {
        person: { select: { id: true, fullName: true } },
        shiftRequirement: {
          include: { shiftTemplate: true, location: true },
        },
      },
      orderBy: [{ date: "asc" }, { startDateTime: "asc" }],
    });

    const conflictLogs = includeConflicts
      ? await prisma.conflictLog.findMany({
          where: { periodId },
          orderBy: { createdAt: "asc" },
        })
      : [];

    const startDateStr = period.startDate.toLocaleDateString("tr-TR");
    const endDateStr = period.endDate.toLocaleDateString("tr-TR");
    const viewLabel =
      view === "person"
        ? "Kişi Bazlı"
        : view === "location"
          ? "Lokasyon Bazlı"
          : "Izgara";

    // ── Grid: dates × (location / shift) ──────────────────────────────────
    const dateSet = new Set<string>();
    for (const a of assignments) dateSet.add(calendarDateKey(a.date));
    const dates = Array.from(dateSet).sort();

    type ColKey = { key: string; label: string };
    const colKeyMap = new Map<string, ColKey>();
    for (const a of assignments) {
      const key = `${a.shiftRequirement.location.id}__${a.shiftRequirement.shiftTemplate.id}`;
      if (!colKeyMap.has(key)) {
        colKeyMap.set(key, {
          key,
          label: `${a.shiftRequirement.location.name} / ${a.shiftRequirement.shiftTemplate.name}`,
        });
      }
    }
    const colKeys = Array.from(colKeyMap.values());

    const planLookup: Record<string, Record<string, string[]>> = {};
    for (const a of assignments) {
      const d = calendarDateKey(a.date);
      const k = `${a.shiftRequirement.location.id}__${a.shiftRequirement.shiftTemplate.id}`;
      (planLookup[d] ??= {})[k] ??= [];
      planLookup[d][k].push(a.person?.fullName ?? "BOŞ");
    }

    const planRows = dates
      .map((date) => {
        const d = new Date(date + "T00:00:00");
        const weekend = d.getDay() === 0 || d.getDay() === 6;
        const cells = colKeys
          .map((col) => {
            const names = planLookup[date]?.[col.key];
            const empty = !names || names.length === 0;
            const val = empty ? "BOŞ" : names.join(", ");
            return `<td class="${empty ? "empty" : ""}">${esc(val)}</td>`;
          })
          .join("");
        return `<tr class="${weekend ? "weekend" : ""}"><td class="date">${esc(
          d.toLocaleDateString("tr-TR")
        )}</td>${cells}</tr>`;
      })
      .join("");

    const planHeader = `<tr><th>Tarih</th>${colKeys
      .map((c) => `<th>${esc(c.label)}</th>`)
      .join("")}</tr>`;

    // ── Person summary ────────────────────────────────────────────────────
    let summaryHtml = "";
    if (includeSummary) {
      type Stats = { fullName: string; total: number; night: number; weekend: number };
      const stats = new Map<string, Stats>();
      for (const a of assignments) {
        if (!a.person) continue;
        const s =
          stats.get(a.person.id) ??
          { fullName: a.person.fullName, total: 0, night: 0, weekend: 0 };
        s.total++;
        if (a.shiftRequirement.shiftTemplate.isNightShift) s.night++;
        const dow = new Date(a.date).getDay();
        if (dow === 0 || dow === 6) s.weekend++;
        stats.set(a.person.id, s);
      }
      const sorted = Array.from(stats.values()).sort((a, b) =>
        a.fullName.localeCompare(b.fullName, "tr")
      );
      const rows = sorted
        .map(
          (s) =>
            `<tr><td>${esc(s.fullName)}</td><td>${s.total}</td><td>${s.night}</td><td>${s.weekend}</td></tr>`
        )
        .join("");
      summaryHtml = `
        <h2>Kişi Özeti</h2>
        <table class="summary">
          <thead><tr><th>Personel</th><th>Toplam</th><th>Gece</th><th>Hafta Sonu</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" class="muted">Atanmış personel yok.</td></tr>'}</tbody>
        </table>`;
    }

    // ── Unfilled / conflicts ──────────────────────────────────────────────
    const unfilled = assignments.filter((a) => a.status === "UNFILLED" || a.person === null);
    const unfilledRows = unfilled
      .map(
        (a) =>
          `<tr><td>${esc(new Date(a.date).toLocaleDateString("tr-TR"))}</td><td>${esc(
            a.shiftRequirement.location.name
          )}</td><td>${esc(a.shiftRequirement.shiftTemplate.name)}</td></tr>`
      )
      .join("");

    let conflictsHtml = "";
    if (includeConflicts) {
      const logRows = conflictLogs
        .map(
          (l) =>
            `<tr><td>${esc(l.type)}</td><td>${esc(l.severity)}</td><td>${esc(l.message)}</td></tr>`
        )
        .join("");
      conflictsHtml = `
        <h2>Boş Nöbetler ve Çakışmalar</h2>
        <table class="conflicts">
          <thead><tr><th>Tarih</th><th>Lokasyon</th><th>Vardiya</th></tr></thead>
          <tbody>${
            unfilled.length
              ? unfilledRows
              : '<tr><td colspan="3" class="ok">Tüm nöbetler atanmıştır.</td></tr>'
          }</tbody>
        </table>
        ${
          logRows
            ? `<table class="conflicts" style="margin-top:12px"><thead><tr><th>Tür</th><th>Önem</th><th>Mesaj</th></tr></thead><tbody>${logRows}</tbody></table>`
            : ""
        }`;
    }

    const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<title>${esc(options.title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #0f172a; margin: 0; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; text-align: center; }
  h2 { font-size: 14px; margin: 24px 0 8px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; }
  .meta { text-align: center; color: #475569; font-size: 12px; margin-bottom: 16px; }
  .meta strong { color: #0f172a; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; vertical-align: top; }
  thead th { background: #2563eb; color: #fff; }
  .summary thead th { background: #059669; }
  .conflicts thead th { background: #dc2626; }
  td.date { font-weight: 600; white-space: nowrap; }
  tr.weekend { background: #fef9c3; }
  td.empty { color: #dc2626; font-style: italic; }
  .muted { color: #6b7280; font-style: italic; }
  .ok { color: #16a34a; font-style: italic; }
  .summary td:not(:first-child), .summary th:not(:first-child) { text-align: center; }
  @media print { .no-print { display: none; } body { padding: 0; } }
  .no-print { text-align: center; margin-bottom: 16px; }
  .no-print button { background: #2563eb; color: #fff; border: 0; padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; }
</style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()">Yazdır / PDF olarak kaydet</button>
  </div>
  <h1>${esc(options.title)}</h1>
  <div class="meta">
    <strong>Hastane:</strong> ${esc(options.hospitalName)}
    &nbsp;|&nbsp; <strong>Çalışma Ayı:</strong> ${esc(options.monthLabel)}
    &nbsp;|&nbsp; <strong>Dönem:</strong> ${esc(startDateStr)} – ${esc(endDateStr)} (${esc(period.name)})
    &nbsp;|&nbsp; <strong>Toplam Atama:</strong> ${assignments.length}
    &nbsp;|&nbsp; <strong>Boş:</strong> ${unfilled.length}
    &nbsp;|&nbsp; <strong>Görünüm:</strong> ${esc(viewLabel)}
  </div>

  <h2>Nöbet Planı</h2>
  ${
    assignments.length === 0
      ? '<p class="muted">Bu dönem için atama bulunmamaktadır.</p>'
      : `<table><thead>${planHeader}</thead><tbody>${planRows}</tbody></table>`
  }

  ${summaryHtml}
  ${conflictsHtml}

  <script>
    window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 300); });
  </script>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[GET /api/periods/:id/export/pdf]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}
