import { inflateRawSync } from "node:zlib";

/** A type tedrisat stores, as it serves it back. */
export interface IFileType {
  /** The `Content-Type` a download carries. */
  contentType: string;
  /** The extension the stored name ends in. */
  extension: string;
}

const t = (contentType: string, extension: string): IFileType => ({
  contentType,
  extension,
});

/**
 * What may be uploaded (MDRS-287, MDRS-290): PDF, PNG, JPEG, WebP, the three
 * Office Open XML documents and plain UTF-8 text. Everything else — HTML,
 * SVG, an arbitrary ZIP, an executable, a macro-enabled Office file — is
 * refused. The browser's claimed type and the file's extension are never
 * asked: `sniffFileType` reads the bytes.
 */
export const FILE_TYPES = {
  PDF: t("application/pdf", "pdf"),
  PNG: t("image/png", "png"),
  JPEG: t("image/jpeg", "jpg"),
  WEBP: t("image/webp", "webp"),
  DOCX: t(
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "docx"
  ),
  XLSX: t(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xlsx"
  ),
  PPTX: t(
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "pptx"
  ),
  TEXT: t("text/plain; charset=utf-8", "txt"),
} as const;

const startsWith = (bytes: Buffer, at: number, ascii: string): boolean =>
  bytes.length >= at + ascii.length &&
  bytes.subarray(at, at + ascii.length).toString("latin1") === ascii;

/**
 * The type of an upload, read from its bytes, or null when it is none of
 * `FILE_TYPES`. An empty buffer is null.
 */
export function sniffFileType(bytes: Buffer): IFileType | null {
  if (bytes.length === 0) return null;
  if (startsWith(bytes, 0, "%PDF-")) return FILE_TYPES.PDF;
  // The signature, then the IHDR chunk every PNG opens with.
  if (
    startsWith(bytes, 0, "\x89PNG\r\n\x1a\n") &&
    startsWith(bytes, 12, "IHDR")
  ) {
    return FILE_TYPES.PNG;
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return FILE_TYPES.JPEG;
  }
  if (
    startsWith(bytes, 0, "RIFF") &&
    startsWith(bytes, 8, "WEBP") &&
    ["VP8 ", "VP8L", "VP8X"].some((chunk) => startsWith(bytes, 12, chunk))
  ) {
    return FILE_TYPES.WEBP;
  }
  if (startsWith(bytes, 0, "PK\x03\x04")) return officeTypeOf(bytes);
  return isPlainText(bytes) ? FILE_TYPES.TEXT : null;
}

// ---- Office Open XML -------------------------------------------------------

/** The part each document is built around, and the type its `[Content_Types].xml` gives that part. */
const OFFICE_DOCUMENTS = [
  {
    type: FILE_TYPES.DOCX,
    part: "word/document.xml",
    mainType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
  },
  {
    type: FILE_TYPES.XLSX,
    part: "xl/workbook.xml",
    mainType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
  },
  {
    type: FILE_TYPES.PPTX,
    part: "ppt/presentation.xml",
    mainType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
  },
] as const;

/** More entries than any document a teacher writes; a bound on the walk below. */
const MAX_ZIP_ENTRIES = 10_000;
/** `[Content_Types].xml` lists a few dozen parts; anything near this is not a document. */
const MAX_CONTENT_TYPES_BYTES = 1024 * 1024;

interface IZipEntry {
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

/**
 * A ZIP is accepted only as a Word, Excel or PowerPoint document: its
 * directory names `[Content_Types].xml`, `_rels/.rels` and exactly one of the
 * three main parts, `[Content_Types].xml` gives that part its document type,
 * and no macro project is inside. Only the directory is walked and only
 * `[Content_Types].xml` is inflated, with its size bounded, so a ZIP bomb
 * costs nothing. ZIP64, which no document of 25 MB needs, is refused.
 */
function officeTypeOf(bytes: Buffer): IFileType | null {
  const entries = zipDirectory(bytes);
  if (!entries) return null;
  if (!entries.has("[Content_Types].xml") || !entries.has("_rels/.rels")) {
    return null;
  }
  for (const name of entries.keys()) {
    if (/vbaProject\.bin$/i.test(name)) return null;
  }
  const present = OFFICE_DOCUMENTS.filter((doc) => entries.has(doc.part));
  if (present.length !== 1) return null;
  const [doc] = present;
  const types = entryText(
    bytes,
    entries.get("[Content_Types].xml") as IZipEntry
  );
  if (types === null || /macroEnabled/i.test(types)) return null;
  return types.includes(doc.mainType) ? doc.type : null;
}

/** The central directory's entries by name, or null when it is not a plain ZIP. */
function zipDirectory(bytes: Buffer): Map<string, IZipEntry> | null {
  const eocd = findEndOfDirectory(bytes);
  if (eocd < 0) return null;
  const count = bytes.readUInt16LE(eocd + 10);
  const size = bytes.readUInt32LE(eocd + 12);
  const offset = bytes.readUInt32LE(eocd + 16);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
    return null; // ZIP64
  }
  if (count > MAX_ZIP_ENTRIES || offset + size > eocd) return null;
  const entries = new Map<string, IZipEntry>();
  let at = offset;
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || bytes.readUInt32LE(at) !== 0x02014b50) {
      return null;
    }
    const nameLength = bytes.readUInt16LE(at + 28);
    const extraLength = bytes.readUInt16LE(at + 30);
    const commentLength = bytes.readUInt16LE(at + 32);
    const end = at + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.length) return null;
    entries.set(
      bytes.subarray(at + 46, at + 46 + nameLength).toString("utf8"),
      {
        method: bytes.readUInt16LE(at + 10),
        compressedSize: bytes.readUInt32LE(at + 20),
        uncompressedSize: bytes.readUInt32LE(at + 24),
        localHeaderOffset: bytes.readUInt32LE(at + 42),
      }
    );
    at = end;
  }
  return entries;
}

/** The offset of the end-of-central-directory record, or -1. */
function findEndOfDirectory(bytes: Buffer): number {
  const last = bytes.length - 22;
  const first = Math.max(0, last - 0xffff);
  for (let at = last; at >= first; at--) {
    if (
      bytes.readUInt32LE(at) === 0x06054b50 &&
      at + 22 + bytes.readUInt16LE(at + 20) === bytes.length
    ) {
      return at;
    }
  }
  return -1;
}

/** One small entry's text (stored or deflated), or null when it cannot be read within bounds. */
function entryText(bytes: Buffer, entry: IZipEntry): string | null {
  if (entry.uncompressedSize > MAX_CONTENT_TYPES_BYTES) return null;
  const header = entry.localHeaderOffset;
  if (header + 30 > bytes.length || bytes.readUInt32LE(header) !== 0x04034b50) {
    return null;
  }
  const start =
    header +
    30 +
    bytes.readUInt16LE(header + 26) +
    bytes.readUInt16LE(header + 28);
  const end = start + entry.compressedSize;
  if (end > bytes.length) return null;
  const data = bytes.subarray(start, end);
  try {
    if (entry.method === 0) return data.toString("utf8");
    if (entry.method === 8) {
      return inflateRawSync(data, {
        maxOutputLength: MAX_CONTENT_TYPES_BYTES,
      }).toString("utf8");
    }
  } catch {
    return null;
  }
  return null;
}

// ---- plain text -------------------------------------------------------------

/**
 * Control characters other than tab, line feed, form feed and carriage
 * return: what a binary file is full of and a text file never holds.
 */
function hasControlCharacter(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code < 0x20 &&
        code !== 0x09 &&
        code !== 0x0a &&
        code !== 0x0c &&
        code !== 0x0d) ||
      code === 0x7f
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Markup a browser would run or render. Text is served as an attachment with
 * `nosniff` anyway; HTML and SVG are refused outright, as the issue lists.
 */
const MARKUP =
  /<\s*(?:!doctype\s+html|html|head|body|script|svg|iframe|object|embed|\?xml)\b/i;

/** Valid UTF-8 (a BOM allowed), no control characters, no markup. */
function isPlainText(bytes: Buffer): boolean {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
      bytes
    );
  } catch {
    return false;
  }
  return !hasControlCharacter(text) && !MARKUP.test(text);
}
