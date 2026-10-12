import { MAX_FILE_BYTES as PROXY_MAX_FILE_BYTES } from "../src/file-proxy";
import {
  ALLOWED_FILE_TYPES,
  FILE_ACCEPT,
  FILE_DOWNLOAD_ERRORS,
  FILE_TYPE_CHIPS,
  fileDownloadError,
  fileDownloadErrorOf,
  fileTypeChip,
  formatFileSize,
  MAX_FILE_BYTES,
  MAX_SUBMISSION_FILES,
} from "../src/file-rules";

// MDRS-287, MDRS-290: the one client-safe copy of tedrisat's file rules that
// tedris, nazar, nizam and the file proxy read.

const MB = 1024 * 1024;

describe("the limits", () => {
  it("are tedrisat's 25 MB a file and 5 files a homework, and the proxy's", () => {
    expect(MAX_FILE_BYTES).toBe(25 * MB);
    expect(PROXY_MAX_FILE_BYTES).toBe(MAX_FILE_BYTES);
    expect(MAX_SUBMISSION_FILES).toBe(5);
  });
});

describe("FILE_ACCEPT", () => {
  it("offers the picker tedrisat's types by extension and by type", () => {
    const accept = FILE_ACCEPT.split(",");
    for (const entry of [
      ".pdf",
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".docx",
      ".xlsx",
      ".pptx",
      ".txt",
      ...ALLOWED_FILE_TYPES,
    ]) {
      expect(accept, entry).toContain(entry);
    }
  });

  it("offers nothing tedrisat refuses or a browser would run", () => {
    const accept = FILE_ACCEPT.split(",");
    for (const entry of [
      ".html",
      ".svg",
      ".zip",
      ".exe",
      ".doc",
      ".xls",
      ".ppt",
      "text/html",
      "image/svg+xml",
    ]) {
      expect(accept, entry).not.toContain(entry);
    }
  });
});

describe("fileTypeChip", () => {
  it.each([
    ["application/pdf", "PDF"],
    ["image/png", "PNG"],
    ["image/jpeg", "JPEG"],
    ["image/webp", "WEBP"],
    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "DOCX",
    ],
    [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "XLSX",
    ],
    [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "PPTX",
    ],
    ["text/plain; charset=utf-8", "TXT"],
    [" IMAGE/JPEG ", "JPEG"],
  ])("labels %j as %s", (contentType, chip) => {
    expect(fileTypeChip(contentType)).toBe(chip);
  });

  it("has a chip for every allowed type and none for anything else", () => {
    expect(Object.keys(FILE_TYPE_CHIPS).sort()).toEqual(
      [...ALLOWED_FILE_TYPES].sort()
    );
    for (const contentType of [
      "text/html",
      "application/octet-stream",
      "constructor",
      "__proto__",
      "",
      null,
      undefined,
    ]) {
      expect(fileTypeChip(contentType), String(contentType)).toBeNull();
    }
  });
});

describe("formatFileSize", () => {
  const plain = (value: string) => value.replace(/\s/g, " ");

  it("counts in steps of 1024, so a file at the limit reads 25 MB", () => {
    expect(plain(formatFileSize(26_214_400, "tr"))).toBe("25 MB");
    expect(plain(formatFileSize(26_214_400, "en"))).toBe("25 MB");
  });

  it("writes whole bytes and kilobytes, megabytes to one decimal, in the page's language", () => {
    expect(plain(formatFileSize(512, "tr"))).toBe("512 bayt");
    expect(plain(formatFileSize(20 * 1024, "tr"))).toBe("20 kB");
    expect(plain(formatFileSize(1.5 * MB, "tr"))).toBe("1,5 MB");
    expect(plain(formatFileSize(1.5 * MB, "en"))).toBe("1.5 MB");
    expect(plain(formatFileSize(1_468_006, "tr"))).toBe("1,4 MB");
  });

  it("reads nothing below zero or not a number, and falls back on Turkish", () => {
    expect(plain(formatFileSize(-1, "tr"))).toBe("0 bayt");
    expect(plain(formatFileSize(Number.NaN, "tr"))).toBe("0 bayt");
    expect(plain(formatFileSize(1.5 * MB, "not a locale"))).toBe("1,5 MB");
  });
});

describe("?fileError=", () => {
  it("takes one of the four reasons and nothing else", () => {
    for (const reason of FILE_DOWNLOAD_ERRORS) {
      expect(fileDownloadError(reason)).toBe(reason);
    }
    for (const value of [
      "",
      "HTTP_403",
      "RESOURCE_FILE_NOT_FOUND",
      "<script>",
      "toString",
      null,
      undefined,
      403,
    ]) {
      expect(fileDownloadError(value), String(value)).toBeNull();
    }
  });

  it("names a refusal by its status", () => {
    expect(fileDownloadErrorOf(403)).toBe("forbidden");
    for (const status of [400, 404, 410]) {
      expect(fileDownloadErrorOf(status), String(status)).toBe("notFound");
    }
    for (const status of [502, 503, 504]) {
      expect(fileDownloadErrorOf(status), String(status)).toBe("unavailable");
    }
    for (const status of [409, 429, 500, 304]) {
      expect(fileDownloadErrorOf(status), String(status)).toBe("failed");
    }
  });
});
