import {
  attachmentDisposition,
  MAX_FILE_NAME_LENGTH,
  sanitizeFileName,
} from "../../../src/storage/file-name";
import { FILE_TYPES } from "../../../src/storage/file-type";

/**
 * MDRS-287: a file's name is a label only — shown in lists and handed back
 * in the download's Content-Disposition — and never part of a storage key.
 */
describe("sanitizeFileName (MDRS-287)", () => {
  it("keeps an ordinary name, Turkish letters and all", () => {
    expect(sanitizeFileName("Emsile şerhi — 1. bab.pdf", FILE_TYPES.PDF)).toBe(
      "Emsile şerhi — 1. bab.pdf"
    );
  });

  it("keeps only the last path segment", () => {
    expect(sanitizeFileName("C:\\Users\\ali\\ödev.docx", FILE_TYPES.DOCX)).toBe(
      "ödev.docx"
    );
    expect(sanitizeFileName("../../etc/passwd.txt", FILE_TYPES.TEXT)).toBe(
      "passwd.txt"
    );
  });

  it("drops control characters and right-to-left overrides", () => {
    // U+202E would make "fdp.exe" read as "exe.pdf".
    expect(sanitizeFileName("rapor\u202efdp.exe\u0007", FILE_TYPES.PDF)).toBe(
      "raporfdp.exe.pdf"
    );
  });

  it("replaces the characters Windows refuses and the quote, folds whitespace and trims dots", () => {
    expect(
      sanitizeFileName('  ..a<b>c:"d|e?f*g   h..  .txt', FILE_TYPES.TEXT)
    ).toBe("a_b_c__d_e_f_g h.txt");
  });

  it("makes the extension the type's: one that disagrees gets the type's added", () => {
    expect(sanitizeFileName("ödev.html", FILE_TYPES.PDF)).toBe("ödev.html.pdf");
    expect(sanitizeFileName("not", FILE_TYPES.PNG)).toBe("not.png");
    expect(sanitizeFileName("Foto.JPEG", FILE_TYPES.JPEG)).toBe("Foto.jpeg");
    expect(sanitizeFileName("liste.csv", FILE_TYPES.TEXT)).toBe(
      "liste.csv.txt"
    );
  });

  it("names a file with nothing left, and steers clear of the names Windows reserves", () => {
    expect(sanitizeFileName("", FILE_TYPES.PDF)).toBe("dosya.pdf");
    expect(sanitizeFileName(null, FILE_TYPES.PDF)).toBe("dosya.pdf");
    expect(sanitizeFileName("...", FILE_TYPES.PDF)).toBe("dosya.pdf");
    expect(sanitizeFileName("con.txt", FILE_TYPES.TEXT)).toBe("_con.txt");
  });

  it("is at most 200 characters, the extension kept", () => {
    const name = sanitizeFileName(`${"ş".repeat(400)}.pdf`, FILE_TYPES.PDF);
    expect(Array.from(name)).toHaveLength(MAX_FILE_NAME_LENGTH);
    expect(name.endsWith(".pdf")).toBe(true);
  });

  it("normalises to NFC", () => {
    const decomposed = "s\u0327erh.pdf"; // ş as s + combining cedilla
    expect(sanitizeFileName(decomposed, FILE_TYPES.PDF)).toBe("şerh.pdf");
  });
});

describe("attachmentDisposition (MDRS-287)", () => {
  it("is always an attachment, with an ASCII fallback and the exact name in filename*", () => {
    expect(attachmentDisposition("Emsile şerhi.pdf")).toBe(
      "attachment; filename=\"Emsile serhi.pdf\"; filename*=UTF-8''Emsile%20%C5%9Ferhi.pdf"
    );
  });

  it("cannot be broken out of by a quote or a backslash", () => {
    const header = attachmentDisposition('a"b\\c.txt');
    expect(header).toContain('filename="a_b_c.txt"');
    expect(header).toContain("filename*=UTF-8''a%22b%5Cc.txt");
  });
});
