import type ExcelJS from "exceljs";

export type PlaceholderVars = {
  hospital: string;
  month: string;
  year: string;
  period: string;
  title: string;
  HOSPITAL: string;
  MONTH: string;
  YEAR: string;
  PERIOD: string;
  TITLE: string;
};

export function buildPlaceholderVars(input: {
  hospitalName: string;
  monthLabel: string;
  year: string;
  periodName: string;
  title: string;
}): PlaceholderVars {
  const { hospitalName, monthLabel, year, periodName, title } = input;
  return {
    hospital: hospitalName,
    month: monthLabel,
    year,
    period: periodName,
    title,
    HOSPITAL: hospitalName,
    MONTH: monthLabel,
    YEAR: year,
    PERIOD: periodName,
    TITLE: title,
  };
}

export function applyPlaceholders(text: string, vars: PlaceholderVars): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key as keyof PlaceholderVars];
    return value ?? `{{${key}}}`;
  });
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text;
  }
  if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text ?? "").join("");
  }
  return String(value);
}

export async function applyPlaceholdersToWorkbook(
  workbook: ExcelJS.Workbook,
  vars: PlaceholderVars
): Promise<void> {
  workbook.eachSheet((sheet) => {
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        const raw = cellText(cell.value);
        if (!raw.includes("{{")) return;
        const next = applyPlaceholders(raw, vars);
        if (next !== raw) cell.value = next;
      });
    });
  });
}