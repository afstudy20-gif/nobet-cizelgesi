/**
 * Briefcase regroup logic — the only briefcase behaviour reachable without a
 * live Google account. The Drive I/O (upload/list/stream/remove) goes through
 * `driveSync.authFetch` and an OAuth token, so it cannot be exercised here;
 * instead we feed raw Drive file metadata into the pure regrounder and assert
 * the grouping, ordering, size fallback and completeness invariants.
 */
import { describe, it, expect } from "vitest";
import { regroupBriefcaseFiles } from "../briefcase";

type DriveFileMetaInput = Parameters<typeof regroupBriefcaseFiles>[0][number];

interface Meta {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  appProperties?: Record<string, string>;
}

const base = (o: Meta): DriveFileMetaInput => ({
  id: o.id,
  name: o.name,
  mimeType: o.mimeType ?? "image/png",
  modifiedTime: o.modifiedTime ?? "2025-01-01T00:00:00.000Z",
  size: o.size,
  appProperties: o.appProperties,
});

describe("regroupBriefcaseFiles", () => {
  it("treats an ungrouped file as a single complete entry", () => {
    const files = [
      base({
        id: "f1",
        name: "report.pdf",
        mimeType: "application/pdf",
        size: "12345",
        appProperties: { nobet: "briefcase" },
      }),
    ];
    const [entry] = regroupBriefcaseFiles(files);
    expect(entry).toMatchObject({
      id: "f1",
      name: "report.pdf",
      size: 12345,
      chunked: false,
      incomplete: false,
      partIds: ["f1"],
      totalParts: 1,
    });
  });

  it("merges parts of one group, ordered by part index", () => {
    const group = "g1";
    const files = [
      base({
        id: "p3",
        name: "big.zip.part3of3",
        size: "1000",
        modifiedTime: "2025-01-03T00:00:00.000Z",
        appProperties: {
          nobet: "briefcase",
          nobetGroup: group,
          nobetPart: "3",
          nobetParts: "3",
          nobetSize: "3000",
          nobetType: "application/zip",
        },
      }),
      base({
        id: "p1",
        name: "big.zip.part1of3",
        size: "1000",
        modifiedTime: "2025-01-01T00:00:00.000Z",
        appProperties: {
          nobet: "briefcase",
          nobetGroup: group,
          nobetPart: "1",
          nobetParts: "3",
          nobetSize: "3000",
          nobetType: "application/zip",
        },
      }),
      base({
        id: "p2",
        name: "big.zip.part2of3",
        size: "1000",
        modifiedTime: "2025-01-02T00:00:00.000Z",
        appProperties: {
          nobet: "briefcase",
          nobetGroup: group,
          nobetPart: "2",
          nobetParts: "3",
          nobetSize: "3000",
          nobetType: "application/zip",
        },
      }),
    ];
    const entries = regroupBriefcaseFiles(files);
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry).toMatchObject({
      id: group,
      name: "big.zip",
      mimeType: "application/zip",
      size: 3000,
      chunked: true,
      incomplete: false,
      totalParts: 3,
      partIds: ["p1", "p2", "p3"],
    });
    // Modified time is the newest of the parts.
    expect(entry.modifiedTime).toBe("2025-01-03T00:00:00.000Z");
  });

  it("marks a group missing parts as incomplete", () => {
    const group = "g2";
    const files = [
      base({
        id: "p1",
        name: "x.bin.part1of4",
        size: "1",
        appProperties: {
          nobet: "briefcase",
          nobetGroup: group,
          nobetPart: "1",
          nobetParts: "4",
          nobetSize: "4",
          nobetType: "application/octet-stream",
        },
      }),
      base({
        id: "p3",
        name: "x.bin.part3of4",
        size: "1",
        appProperties: {
          nobet: "briefcase",
          nobetGroup: group,
          nobetPart: "3",
          nobetParts: "4",
          nobetSize: "4",
          nobetType: "application/octet-stream",
        },
      }),
    ];
    const [entry] = regroupBriefcaseFiles(files);
    expect(entry.incomplete).toBe(true);
    // Parts that are present are still ordered and exposed (delete needs them).
    expect(entry.partIds).toEqual(["p1", "p3"]);
  });

  it("sorts entries newest-first across singles and groups", () => {
    const files = [
      base({
        id: "old",
        name: "old.txt",
        size: "1",
        modifiedTime: "2024-01-01T00:00:00.000Z",
        appProperties: { nobet: "briefcase" },
      }),
      base({
        id: "new",
        name: "new.txt",
        size: "1",
        modifiedTime: "2026-01-01T00:00:00.000Z",
        appProperties: { nobet: "briefcase" },
      }),
    ];
    const entries = regroupBriefcaseFiles(files);
    expect(entries.map((e) => e.name)).toEqual(["new.txt", "old.txt"]);
  });

  it("falls back to summed part sizes when the declared size is missing", () => {
    const group = "g3";
    const files = [
      base({
        id: "a",
        name: "no-size.zip.part1of2",
        size: "700",
        appProperties: {
          nobet: "briefcase",
          nobetGroup: group,
          nobetPart: "1",
          nobetParts: "2",
          nobetType: "application/zip",
        },
      }),
      base({
        id: "b",
        name: "no-size.zip.part2of2",
        size: "300",
        appProperties: {
          nobet: "briefcase",
          nobetGroup: group,
          nobetPart: "2",
          nobetParts: "2",
          nobetType: "application/zip",
        },
      }),
    ];
    const [entry] = regroupBriefcaseFiles(files);
    expect(entry.size).toBe(1000);
  });

  it("returns an empty list for no files", () => {
    expect(regroupBriefcaseFiles([])).toEqual([]);
  });
});
