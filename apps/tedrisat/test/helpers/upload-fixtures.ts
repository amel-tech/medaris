import { deflateRawSync } from "node:zlib";

/**
 * The smallest files of each kind the upload checks tell apart (MDRS-287):
 * real signatures and, for the Office documents, real ZIP containers whose
 * central directory and `[Content_Types].xml` say what they are. Built here
 * rather than committed as binaries, so a spec shows what makes each one
 * pass or fail.
 */

export const pdf = (): Buffer =>
  Buffer.from(
    "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer\n%%EOF\n"
  );

export function png(): Buffer {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4, "latin1");
  ihdr.writeUInt32BE(1, 8); // width
  ihdr.writeUInt32BE(1, 12); // height
  ihdr[16] = 8; // bit depth
  ihdr[17] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ihdr,
  ]);
}

export const jpeg = (): Buffer =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    Buffer.from("JFIF\0", "latin1"),
    Buffer.alloc(16),
    Buffer.from([0xff, 0xd9]),
  ]);

export function webp(): Buffer {
  const body = Buffer.concat([
    Buffer.from("WEBPVP8 ", "latin1"),
    Buffer.alloc(14),
  ]);
  const head = Buffer.from("RIFF\0\0\0\0", "latin1");
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

export const text = (body = "Ödev notları: birinci bab\n"): Buffer =>
  Buffer.from(body, "utf8");

export const html = (): Buffer =>
  Buffer.from(
    "<!DOCTYPE html><html><body><script>alert(1)</script></body></html>"
  );

export const svg = (): Buffer =>
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect/></svg>'
  );

/** A Windows executable's first bytes. */
export const exe = (): Buffer =>
  Buffer.concat([Buffer.from("MZ", "latin1"), Buffer.alloc(62)]);

// ---- ZIP ---------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A ZIP of the given entries, each deflated, as Office writes them. */
export function zip(entries: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const raw = Buffer.from(content, "utf8");
    const data = deflateRawSync(raw);
    const nameBytes = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(raw), 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const RELS =
  '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>';

const contentTypes = (part: string, type: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/${part}" ContentType="${type}"/></Types>`;

const office = (
  part: string,
  type: string,
  extra: Record<string, string> = {}
) =>
  zip({
    "[Content_Types].xml": contentTypes(part, type),
    "_rels/.rels": RELS,
    [part]: "<document/>",
    ...extra,
  });

export const docx = (): Buffer =>
  office(
    "word/document.xml",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
  );

export const xlsx = (): Buffer =>
  office(
    "xl/workbook.xml",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"
  );

export const pptx = (): Buffer =>
  office(
    "ppt/presentation.xml",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"
  );

/** A Word document with macros, under a `.docx` name or not: refused. */
export const docm = (): Buffer =>
  office(
    "word/document.xml",
    "application/vnd.ms-word.document.macroEnabled.main+xml",
    { "word/vbaProject.bin": "macros" }
  );

/** A ZIP that is no Office document. */
export const plainZip = (): Buffer => zip({ "notes.txt": "hello" });

/** Office's directory markers, but the content types say nothing of a document. */
export const fakeDocx = (): Buffer =>
  office("word/document.xml", "application/xml");
