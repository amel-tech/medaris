import { FILE_TYPES, sniffFileType } from "../../../src/storage/file-type";
import {
  docm,
  docx,
  exe,
  fakeDocx,
  html,
  jpeg,
  pdf,
  plainZip,
  png,
  pptx,
  svg,
  text,
  webp,
  xlsx,
  zip,
} from "../../helpers/upload-fixtures";

/**
 * MDRS-287: an upload's type is read from its bytes, against the issue's
 * list — PDF, PNG, JPEG, WebP, DOCX, XLSX, PPTX, plain text — and nothing
 * else. What the browser claims and what the name says are never asked.
 */
describe("sniffFileType (MDRS-287)", () => {
  it.each([
    ["a PDF", pdf, FILE_TYPES.PDF],
    ["a PNG", png, FILE_TYPES.PNG],
    ["a JPEG", jpeg, FILE_TYPES.JPEG],
    ["a WebP", webp, FILE_TYPES.WEBP],
    ["a Word document", docx, FILE_TYPES.DOCX],
    ["an Excel workbook", xlsx, FILE_TYPES.XLSX],
    ["a PowerPoint deck", pptx, FILE_TYPES.PPTX],
    ["UTF-8 text with Turkish letters", () => text(), FILE_TYPES.TEXT],
  ])("accepts %s", (_, make, type) => {
    expect(sniffFileType(make())).toBe(type);
  });

  it("accepts text with a BOM, tabs and CRLF line ends", () => {
    expect(sniffFileType(Buffer.from("\ufeffBir\tİki\r\nÜç\n", "utf8"))).toBe(
      FILE_TYPES.TEXT
    );
  });

  it.each([
    ["HTML", html],
    ["SVG", svg],
    ["an executable", exe],
    ["a ZIP that is no Office document", plainZip],
    ["a macro-enabled Word document", docm],
    ["an Office layout whose content types name no document", fakeDocx],
  ])("refuses %s", (_, make) => {
    expect(sniffFileType(make())).toBeNull();
  });

  it("refuses an empty file, text that is not UTF-8, and text with NUL or other control bytes", () => {
    expect(sniffFileType(Buffer.alloc(0))).toBeNull();
    expect(sniffFileType(Buffer.from([0x66, 0xff, 0xfe, 0x67]))).toBeNull();
    expect(sniffFileType(Buffer.from("ab\0cd", "latin1"))).toBeNull();
    expect(sniffFileType(Buffer.from("ab\u001bcd", "utf8"))).toBeNull();
  });

  it("refuses text that carries markup a browser would run, wherever it sits", () => {
    expect(
      sniffFileType(text("Notlar\n\n<script>alert(1)</script>\n"))
    ).toBeNull();
    expect(sniffFileType(text('<?xml version="1.0"?><x/>'))).toBeNull();
    // A less-than sign in prose is still text.
    expect(sniffFileType(text("3 < 5 ve 5 > 3\n"))).toBe(FILE_TYPES.TEXT);
  });

  it("does not take a signature that is only half there", () => {
    expect(sniffFileType(Buffer.from("%PD"))).toBe(FILE_TYPES.TEXT);
    expect(sniffFileType(png().subarray(0, 10))).toBeNull();
    expect(
      sniffFileType(Buffer.from("RIFF\0\0\0\0WAVEfmt ", "latin1"))
    ).toBeNull();
  });

  it("refuses a ZIP whose directory is cut off or claims more entries than it holds", () => {
    const whole = docx();
    expect(sniffFileType(whole.subarray(0, whole.length - 10))).toBeNull();
    const lying = Buffer.from(whole);
    lying.writeUInt16LE(500, lying.length - 12);
    expect(sniffFileType(lying)).toBeNull();
  });

  it("refuses a document claiming two kinds at once", () => {
    const both = zip({
      "[Content_Types].xml":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
      "_rels/.rels": "<Relationships/>",
      "word/document.xml": "<document/>",
      "xl/workbook.xml": "<workbook/>",
    });
    expect(sniffFileType(both)).toBeNull();
  });
});
