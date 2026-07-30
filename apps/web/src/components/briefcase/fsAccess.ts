/**
 * Minimal, narrow typing for the File System Access API corner the briefcase
 * uses. The full API is not in every browser's TS lib, so rather than reaching
 * for `any` we declare only the methods `streamBriefcaseTo` consumes. Callers
 * must still feature-detect at runtime via `supportsSaveFilePicker()`.
 */

interface SaveFilePickerOptions {
  suggestedName?: string;
}

/** Handle returned by `window.showSaveFilePicker`; exposes a writable stream. */
export interface FileSystemFileHandleLike {
  createWritable: () => Promise<{
    write: (data: Blob | BufferSource | string) => Promise<void>;
    close: () => Promise<void>;
    abort: () => Promise<void>;
  }>;
}

/** Whether the File System Access save picker is available in this browser. */
export function supportsSaveFilePicker(): boolean {
  if (typeof window === "undefined") return false;
  const picker = (
    window as unknown as { showSaveFilePicker?: unknown }
  ).showSaveFilePicker;
  return typeof picker === "function";
}

/**
 * Open the save-file picker. Must run synchronously inside the user's click
 * gesture, before any awaited network call — browsers reject the picker once the
 * gesture has been consumed. Returns a writable stream ready to receive parts.
 */
export async function openWritableForSave(
  suggestedName: string,
): Promise<ReturnType<FileSystemFileHandleLike["createWritable"]>> {
  // `showSaveFilePicker` is not in the TS DOM lib here; cast through the minimal
  // shape we declared rather than `any`.
  const picker = (
    window as unknown as {
      showSaveFilePicker?: (
        opts?: SaveFilePickerOptions,
      ) => Promise<FileSystemFileHandleLike>;
    }
  ).showSaveFilePicker;
  if (!picker) {
    throw new Error("save picker unavailable");
  }
  const handle = await picker({ suggestedName });
  return handle.createWritable();
}
