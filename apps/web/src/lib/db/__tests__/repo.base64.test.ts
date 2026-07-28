/**
 * Round-trip of ExportTemplate.fileData through fileToBase64 /
 * base64ToArrayBuffer. The snapshot stores the file inline as base64, so a
 * broken encode/decode silently corrupts every uploaded template. The
 * non-ASCII payload is the important case: a naive charCodeAt/atob over
 * bytes ≥ 128 would mangle them.
 */
import { describe, it, expect } from "vitest";
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  fileToBase64,
} from "../repo";

describe("base64 round-trip", () => {
  it("round-trips an ASCII payload", async () => {
    const text = "Nöbet Çizelgesi template payload";
    const buffer = new TextEncoder().encode(text).buffer;

    const encoded = arrayBufferToBase64(buffer);
    const decoded = base64ToArrayBuffer(encoded);

    expect(new TextDecoder().decode(decoded)).toBe(text);
  });

  it("round-trips a payload with bytes in the full 0–255 range", async () => {
    // 256 bytes, one of every value — catches any sign-extension or
    // charCodeAt-above-127 mistake.
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;

    const encoded = arrayBufferToBase64(bytes.buffer);
    const decoded = new Uint8Array(base64ToArrayBuffer(encoded));

    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });

  it("round-trips a high-byte Turkish/Eastern payload via File", async () => {
    const text = "İstanbul, İzmir, Şanlıurfa — 100% doğrulandı";
    const file = new File([new TextEncoder().encode(text)], "t.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const encoded = await fileToBase64(file);
    const decoded = base64ToArrayBuffer(encoded);

    expect(new TextDecoder().decode(decoded)).toBe(text);
  });

  it("preserves byte length, not UTF-8 character length", async () => {
    // "İ" is U+0130 → two UTF-8 bytes. The base64 layer must carry bytes, not
    // code units, so decoded.byteLength === encoded input byte length.
    const text = "İİİ"; // 3 chars, 6 UTF-8 bytes
    const inputBytes = new TextEncoder().encode(text);

    const encoded = arrayBufferToBase64(inputBytes.buffer);
    const decoded = base64ToArrayBuffer(encoded);

    expect(decoded.byteLength).toBe(inputBytes.byteLength);
  });

  it("round-trips an empty payload", async () => {
    const encoded = arrayBufferToBase64(new ArrayBuffer(0));
    const decoded = base64ToArrayBuffer(encoded);
    expect(decoded.byteLength).toBe(0);
  });
});
