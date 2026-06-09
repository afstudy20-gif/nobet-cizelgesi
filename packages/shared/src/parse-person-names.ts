export type ParsedPersonName = {
  firstName: string;
  lastName: string;
  fullName: string;
  raw: string;
};

const TITLE_PREFIX =
  /^(dr|doç\.?|doc\.?|prof\.?|uzm\.?|hemşire|hemş|sn|sayın|mr|mrs|ms|op)\.?\s+/iu;

const HEADER_LINE =
  /^(ad\s*soyad|ad|soyad|isim|personel|çalışan|çalışanlar|name|staff|liste|sıra|no|#)\b/iu;

function cleanLine(line: string): string {
  return line
    .replace(/^\s*[\d]+[\.\)\-:]\s*/, "")
    .replace(/^\s*[-•*–—]\s*/, "")
    .replace(TITLE_PREFIX, "")
    .trim();
}

function stripContactInfo(line: string): string {
  return line
    .replace(/\s*[<(]?\s*[\w.+-]+@[\w.-]+\.[a-z]{2,}\s*[)>]?/gi, "")
    .replace(/\s*[+]?\d[\d\s().-]{8,}\d\s*/g, "")
    .trim();
}

function splitNameTokens(name: string): { firstName: string; lastName: string } | null {
  const trimmed = name.trim();
  if (!trimmed) return null;

  if (trimmed.includes(",")) {
    const [left, right] = trimmed.split(",").map((s) => s.trim());
    if (left && right) {
      const leftParts = left.split(/\s+/).filter(Boolean);
      const rightParts = right.split(/\s+/).filter(Boolean);
      if (leftParts.length === 1 && rightParts.length >= 1) {
        return { firstName: rightParts.join(" "), lastName: leftParts[0] };
      }
      if (rightParts.length === 1 && leftParts.length >= 1) {
        return { firstName: leftParts.join(" "), lastName: rightParts[0] };
      }
    }
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  if (parts.length === 2) {
    return { firstName: parts[0], lastName: parts[1] };
  }
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function pickNameCell(cells: string[]): string {
  const candidates = cells.map((c) => stripContactInfo(cleanLine(c))).filter(Boolean);
  const withTwoWords = candidates.find((c) => c.split(/\s+/).length >= 2);
  return withTwoWords ?? candidates[0] ?? "";
}

function parseLine(rawLine: string): ParsedPersonName | null {
  let line = rawLine.trim();
  if (!line) return null;

  if (line.includes("\t")) {
    line = pickNameCell(line.split("\t"));
  } else if (line.includes(";") && !line.includes(" ")) {
    return null;
  }

  line = stripContactInfo(cleanLine(line));
  if (!line || HEADER_LINE.test(line)) return null;

  const split = splitNameTokens(line);
  if (!split) return null;

  const firstName = split.firstName.trim();
  const lastName = split.lastName.trim();
  if (!firstName || !lastName) return null;
  if (!/^[\p{L}][\p{L}'`.-]*$/u.test(firstName.replace(/\s/g, ""))) return null;
  if (!/^[\p{L}][\p{L}'`.-]*$/u.test(lastName.replace(/\s/g, ""))) return null;

  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    raw: rawLine.trim(),
  };
}

function expandLines(text: string): string[] {
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (!trimmed.includes("\n") && trimmed.includes(",") && trimmed.split(/\s+/).length <= 6) {
      const commaParts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
      if (commaParts.length >= 2 && commaParts.every((p) => p.split(/\s+/).length >= 2)) {
        lines.push(...commaParts);
        continue;
      }
    }
    if (trimmed.includes(";")) {
      const semi = trimmed.split(";").map((p) => p.trim()).filter(Boolean);
      if (semi.length >= 2) {
        lines.push(...semi);
        continue;
      }
    }
    lines.push(raw);
  }
  return lines;
}

export function parsePersonNamesFromText(text: string): ParsedPersonName[] {
  if (!text.trim()) return [];

  const results: ParsedPersonName[] = [];
  const seen = new Set<string>();

  for (const line of expandLines(text)) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const key = parsed.fullName.toLocaleLowerCase("tr");
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(parsed);
  }

  return results;
}

export function suggestPersonCodes(existingCodes: string[], count: number): string[] {
  const nums = existingCodes
    .map((code) => /^P(\d+)$/i.exec(code)?.[1])
    .filter((n): n is string => Boolean(n))
    .map((n) => Number.parseInt(n, 10))
    .filter((n) => Number.isFinite(n));

  let next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  const codes: string[] = [];
  const used = new Set(existingCodes.map((c) => c.toUpperCase()));

  for (let i = 0; i < count; i++) {
    while (used.has(`P${String(next).padStart(3, "0")}`.toUpperCase())) {
      next += 1;
    }
    const code = `P${String(next).padStart(3, "0")}`;
    codes.push(code);
    used.add(code.toUpperCase());
    next += 1;
  }
  return codes;
}