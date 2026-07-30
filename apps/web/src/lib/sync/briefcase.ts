/**
 * Evrak Çantası (Briefcase) — cross-device file transfer via the user's own
 * Google Drive `appDataFolder`. No server in the middle: a file dropped on one
 * device is stored in the same hidden folder the schedule syncs to, and shows
 * up on every other device signed in to that account.
 *
 * It reuses `driveSync.authFetch` rather than running its own auth flow, so the
 * token, refresh and 401 handling are shared with the rest of the app. Because
 * `authFetch` may open the consent popup (or throw in redirect mode), every
 * function here must be reached from a user gesture — never an effect or a poll.
 *
 * Files are tagged `appProperties.nobet = 'briefcase'` and queries filter on
 * that tag, so they are isolated from the schedule's `nobet-data.json` snapshot
 * living in the same folder — the two can never see each other.
 *
 * Large files (> CHUNK_BYTES) are transparently split into multiple Drive files
 * ("parts") sharing an `appProperties.nobetGroup` id. `list()` re-groups the
 * parts into one logical entry; `streamTo()` / `download()` fetch every part in
 * order and stitch them back. A failed multi-part upload rolls back the parts it
 * already wrote, and an incomplete group (parts found !== parts expected) is
 * marked and refuses to download rather than producing a silently corrupt file.
 */
import { driveSync } from "./drive";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";

// Per-part size. Kept comfortably under Drive's single-file ceiling so each
// chunk's in-memory multipart body stays small and uploads reliably. Mirrors the
// reference implementation; do not raise without revisiting memory use.
export const CHUNK_BYTES = 95 * 1024 * 1024;

const TAG_QUERY = "appProperties has { key='nobet' and value='briefcase' }";
const PART_SUFFIX_RE = /\.part\d+of\d+$/;

const LIST_FIELDS =
  "files(id,name,mimeType,size,modifiedTime,appProperties)";

// ---- Drive API shapes (only the fields this module consumes) ----------------

interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  appProperties?: Record<string, string>;
}

interface DriveListResponse {
  files?: DriveFileMeta[];
}

interface DriveUploadResponse {
  id: string;
}

/**
 * Narrow view of the File System Access API's writable stream. The full type is
 * not in every browser's TS lib, so we declare only what `streamTo` touches
 * rather than reaching for `any`.
 */
export interface BriefcaseWritable {
  write: (data: Blob | BufferSource | string) => Promise<void>;
  close: () => Promise<void>;
  abort?: () => Promise<void>;
}

/** One logical file in the briefcase, whether stored as one Drive file or many parts. */
export interface BriefcaseEntry {
  /** Underlying Drive file id (single) or group id (chunked). */
  id: string;
  name: string;
  mimeType: string;
  size: number;
  /** RFC 3339 timestamp of the most recently written part. */
  modifiedTime: string;
  chunked: boolean;
  /** True when a chunked group is missing parts — never downloadable. */
  incomplete: boolean;
  /** Ordered Drive file ids that make up this entry (one element if not chunked). */
  partIds: string[];
  /** Declared part count for a chunked entry; 1 otherwise. */
  totalParts: number;
}

export type BriefcaseProgress = (part: number, totalParts: number) => void;

// ---- helpers ---------------------------------------------------------------

/** Strip the `.partNofM` suffix added to chunk part names. */
function baseName(partName: string): string {
  return partName.replace(PART_SUFFIX_RE, "");
}

function toInt(value: string | undefined, fallback = 0): number {
  if (value === undefined) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Short, collision-resistant group id for the parts of one upload. */
function newGroupId(): string {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

interface PartAccumulator {
  id: string;
  index: number;
  size: number;
}

interface GroupAccumulator {
  entry: BriefcaseEntry;
  parts: PartAccumulator[];
}

/**
 * Re-group raw Drive file metadata into logical briefcase entries. Pure and
 * dependency-free so it can be unit-tested without hitting the network.
 *
 * Parts of one chunked upload are merged into a single entry; single-file
 * uploads become a one-part entry. An incomplete group (parts found !== parts
 * declared) is marked `incomplete` and must never be downloaded. Entries are
 * sorted newest-first.
 */
export function regroupBriefcaseFiles(
  files: DriveFileMeta[],
): BriefcaseEntry[] {
  const groups = new Map<string, GroupAccumulator>();
  const entries: BriefcaseEntry[] = [];

  for (const f of files) {
    const ap = f.appProperties ?? {};
    if (ap.nobetGroup) {
      let acc = groups.get(ap.nobetGroup);
      if (!acc) {
        const entry: BriefcaseEntry = {
          id: ap.nobetGroup,
          name: baseName(f.name),
          mimeType: ap.nobetType || f.mimeType,
          size: toInt(ap.nobetSize),
          modifiedTime: f.modifiedTime,
          chunked: true,
          incomplete: false,
          partIds: [],
          totalParts: toInt(ap.nobetParts, 1),
        };
        acc = { entry, parts: [] };
        groups.set(ap.nobetGroup, acc);
        entries.push(entry);
      }
      acc.parts.push({ id: f.id, index: toInt(ap.nobetPart), size: toInt(f.size) });
      if (f.modifiedTime > acc.entry.modifiedTime) {
        acc.entry.modifiedTime = f.modifiedTime;
      }
    } else {
      entries.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: toInt(f.size),
        modifiedTime: f.modifiedTime,
        chunked: false,
        incomplete: false,
        partIds: [f.id],
        totalParts: 1,
      });
    }
  }

  for (const { entry, parts } of groups.values()) {
    parts.sort((a, b) => a.index - b.index);
    entry.partIds = parts.map((p) => p.id);
    entry.incomplete = entry.totalParts > 0 && parts.length !== entry.totalParts;
    // Fall back to the summed part size only when the declared size is missing.
    if (!entry.size) {
      entry.size = parts.reduce((sum, p) => sum + p.size, 0);
    }
  }

  entries.sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1));
  return entries;
}

// ---- Drive I/O -------------------------------------------------------------

/** Multipart/related upload of one blob (whole file or a single chunk). */
async function uploadPart(
  name: string,
  mimeType: string,
  blob: Blob,
  appProperties: Record<string, string>,
): Promise<string> {
  const metadata = {
    name,
    parents: ["appDataFolder"],
    mimeType: mimeType || "application/octet-stream",
    appProperties,
  };
  const boundary = `-------nobetBriefcase${Math.random().toString(36).slice(2)}`;
  const body = new Blob(
    [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` },
  );
  const res = await driveSync.authFetch(
    `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (!res.ok) {
    throw new Error(`Yükleme başarısız (${res.status})`);
  }
  const data = (await res.json()) as DriveUploadResponse;
  return data.id;
}

/**
 * Upload a file, splitting it into parts if it exceeds `CHUNK_BYTES`. Reports
 * progress as (partIndex, totalParts). A failed multi-part upload rolls back
 * every part already written so it does not surface as a broken entry.
 */
export async function uploadBriefcase(
  file: Blob & { name?: string },
  onProgress?: BriefcaseProgress,
): Promise<void> {
  const mime = file.type || "application/octet-stream";
  const name = file.name || "dosya";

  if (file.size <= CHUNK_BYTES) {
    if (onProgress) onProgress(1, 1);
    await uploadPart(name, mime, file, { nobet: "briefcase" });
    return;
  }

  const totalParts = Math.ceil(file.size / CHUNK_BYTES);
  const groupId = newGroupId();
  const uploaded: string[] = [];
  try {
    for (let i = 0; i < totalParts; i++) {
      if (onProgress) onProgress(i, totalParts);
      const start = i * CHUNK_BYTES;
      const chunk = file.slice(start, Math.min(start + CHUNK_BYTES, file.size));
      const partName = `${name}.part${i + 1}of${totalParts}`;
      const id = await uploadPart(partName, mime, chunk, {
        nobet: "briefcase",
        nobetGroup: groupId,
        nobetPart: String(i + 1),
        nobetParts: String(totalParts),
        nobetSize: String(file.size),
        nobetType: mime,
      });
      uploaded.push(id);
    }
    if (onProgress) onProgress(totalParts, totalParts);
  } catch (err) {
    // Best-effort rollback so a half-finished upload leaves no orphans.
    for (const id of uploaded) {
      try {
        await driveSync.authFetch(`${DRIVE_API}/files/${id}`, {
          method: "DELETE",
        });
      } catch {
        // Rollback is best-effort; the original error is the one to surface.
      }
    }
    throw err;
  }
}

/** List every logical briefcase entry, read live from Drive. */
export async function listBriefcase(): Promise<BriefcaseEntry[]> {
  const q = encodeURIComponent(TAG_QUERY);
  const res = await driveSync.authFetch(
    `${DRIVE_API}/files?spaces=appDataFolder&q=${q}&fields=${LIST_FIELDS}&pageSize=1000&orderBy=modifiedTime desc`,
  );
  if (!res.ok) {
    throw new Error(`Dosya listesi alınamadı (${res.status})`);
  }
  const data = (await res.json()) as DriveListResponse;
  return regroupBriefcaseFiles(data.files ?? []);
}

/** Fetch the raw bytes of one Drive file. */
async function fetchPart(fileId: string): Promise<Blob> {
  const res = await driveSync.authFetch(`${DRIVE_API}/files/${fileId}?alt=media`);
  if (!res.ok) {
    throw new Error(`Parça indirilemedi (${res.status})`);
  }
  return res.blob();
}

/**
 * Stream every part straight to a writable (opened by the caller inside the
 * click gesture via the File System Access API), so the save dialog appears
 * immediately and nothing large is held in memory. Aborts the writable on
 * failure. Refuses incomplete groups.
 */
export async function streamBriefcaseTo(
  entry: BriefcaseEntry,
  writable: BriefcaseWritable,
  onProgress?: BriefcaseProgress,
): Promise<void> {
  if (entry.incomplete) {
    throw new Error("Bu dosya eksik — indirilemiyor.");
  }
  const ids = entry.partIds;
  try {
    for (let i = 0; i < ids.length; i++) {
      if (onProgress) onProgress(i + 1, ids.length);
      const blob = await fetchPart(ids[i]!);
      await writable.write(blob);
    }
    if (onProgress) onProgress(ids.length, ids.length);
    await writable.close();
  } catch (err) {
    try {
      await writable.abort?.();
    } catch {
      // Abort is best-effort.
    }
    throw err;
  }
}

/**
 * In-memory reassembly into a single Blob. Used as the fallback save path on
 * browsers without the File System Access API (Firefox/Safari); a multi-GB file
 * reassembled here will strain the tab, which is why streaming is preferred.
 */
export async function downloadBriefcase(
  entry: BriefcaseEntry,
  onProgress?: BriefcaseProgress,
): Promise<Blob> {
  if (entry.incomplete) {
    throw new Error("Bu dosya eksik — indirilemiyor.");
  }
  const ids = entry.partIds;
  if (ids.length === 1) {
    if (onProgress) onProgress(1, 1);
    return fetchPart(ids[0]!);
  }
  const blobs: Blob[] = [];
  for (let i = 0; i < ids.length; i++) {
    if (onProgress) onProgress(i + 1, ids.length);
    blobs.push(await fetchPart(ids[i]!));
  }
  return new Blob(blobs, {
    type: entry.mimeType || "application/octet-stream",
  });
}

/**
 * Delete a file or every part of a chunked entry. Best-effort per part so a
 * transient Drive error on one part still removes the rest.
 */
export async function removeBriefcase(entry: BriefcaseEntry): Promise<void> {
  for (const id of entry.partIds) {
    try {
      await driveSync.authFetch(`${DRIVE_API}/files/${id}`, {
        method: "DELETE",
      });
    } catch {
      // Continue deleting remaining parts; a failed part will resurface on next
      // list() and can be removed again.
    }
  }
}
