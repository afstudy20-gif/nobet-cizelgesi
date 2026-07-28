/**
 * Word template post-processing — browser-friendly.
 *
 * Two responsibilities, matching the old Node handler:
 *
 * 1. Replace `{{placeholder}}` tokens inside the uploaded `.docx` template's
 *    `word/document.xml`, headers and footers.
 * 2. Optionally append the body of an `appendBlob` (the plan table produced by
 *    `word-schedule.ts`) just before the template's closing `</w:body>`.
 *
 * All I/O is `ArrayBuffer` / `Blob`. The old version used Node `Buffer` and
 * `type: "nodebuffer"`; in the browser we use `uint8array` and hand the result
 * to `new Blob(...)`. JSZip works identically in both runtimes.
 */

import type JSZipType from "jszip";

/**
 * Loaded on demand. A static import pulls ~100 kB of zip code into the export
 * page's first load for a code path that only runs when the user exports with
 * an uploaded Word template.
 */
async function loadJSZip(): Promise<typeof JSZipType> {
  return (await import("jszip")).default;
}
import { applyPlaceholders, type PlaceholderVars } from "./placeholders";

const DOCX_XML_PATH = /^word\/(document|header\d+|footer\d+)\.xml$/;

function extractBodyContent(documentXml: string): string {
  const match = documentXml.match(/<w:body[^>]*>([\s\S]*)<\/w:body>/i);
  if (!match) return "";
  let inner = match[1].trim();
  inner = inner.replace(/<w:sectPr[\s\S]*?<\/w:sectPr>\s*$/i, "").trim();
  return inner;
}

function insertBeforeClosingBody(documentXml: string, appendXml: string): string {
  const idx = documentXml.lastIndexOf("</w:body>");
  if (idx === -1) return documentXml;
  return `${documentXml.slice(0, idx)}${appendXml}${documentXml.slice(idx)}`;
}

async function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return blob.arrayBuffer();
}

/**
 * Apply placeholder substitution to an uploaded template, and optionally append
 * the schedule body from `appendBlob`. Returns a fresh `.docx` `Blob`.
 *
 * @param templateData the uploaded template bytes (base64-decoded by the caller)
 * @param vars         placeholder values for `{{hospital}}` etc.
 * @param appendBlob   optional `.docx` whose body content is appended
 */
export async function applyPlaceholdersToDocxBuffer(
  templateData: ArrayBuffer,
  vars: PlaceholderVars,
  appendBlob?: Blob
): Promise<Blob> {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(templateData);

  const tasks: Promise<void>[] = [];
  zip.forEach((relativePath, file) => {
    if (file.dir || !DOCX_XML_PATH.test(relativePath)) return;
    tasks.push(
      file.async("string").then((content) => {
        zip.file(relativePath, applyPlaceholders(content, vars));
      })
    );
  });
  await Promise.all(tasks);

  if (appendBlob) {
    const docFile = zip.file("word/document.xml");
    if (docFile) {
      const appendZip = await JSZip.loadAsync(await readBlobAsArrayBuffer(appendBlob));
      const scheduleXml = await appendZip.file("word/document.xml")?.async("string");
      if (scheduleXml) {
        const scheduleInner = extractBodyContent(scheduleXml);
        if (scheduleInner) {
          const templateXml = await docFile.async("string");
          zip.file("word/document.xml", insertBeforeClosingBody(templateXml, scheduleInner));
        }
      }
    }
  }

  const arrayBuffer = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
  return new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
