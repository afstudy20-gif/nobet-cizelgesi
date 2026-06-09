import JSZip from "jszip";
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

export async function applyPlaceholdersToDocxBuffer(
  docxBuffer: Buffer,
  vars: PlaceholderVars,
  appendScheduleBuffer?: Buffer
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(docxBuffer);

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

  if (appendScheduleBuffer) {
    const docFile = zip.file("word/document.xml");
    if (docFile) {
      const scheduleZip = await JSZip.loadAsync(appendScheduleBuffer);
      const scheduleXml = await scheduleZip.file("word/document.xml")?.async("string");
      if (scheduleXml) {
        const scheduleInner = extractBodyContent(scheduleXml);
        if (scheduleInner) {
          const templateXml = await docFile.async("string");
          zip.file("word/document.xml", insertBeforeClosingBody(templateXml, scheduleInner));
        }
      }
    }
  }

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}