/**
 * Browser download + print helpers for the export flow.
 *
 * `downloadBlob` creates a temporary object URL, clicks an anchor and then
 * revokes the URL. Revoking matters: a leaked object URL pins the whole workbook
 * `Blob` (and its underlying ArrayBuffer) in memory for the life of the tab,
 * which for a large `.xlsx` can be many megabytes.
 *
 * `openPrintWindow` writes an HTML document into a new window/tab. The browser's
 * own print dialog handles "Save as PDF" — no PDF library needed.
 */

/**
 * Trigger a browser download of `blob` as `filename`, then release the object
 * URL. Safe to call repeatedly; each call uses its own anchor.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke on the next tick so the click has a chance to start the download
  // in browsers that dispatch the navigation synchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Open `html` in a new window/tab and let the user print or save as PDF.
 *
 * Returns the opened `Window`, or `null` if the browser blocked the popup
 * (caller should fall back to a download of the HTML).
 */
export function openPrintWindow(html: string): Window | null {
  const win = window.open("", "_blank");
  if (!win) return null;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return win;
}
