import { describe, expect, it } from "vitest";
import {
  fileErrorKey,
  fileIcon,
  parseSubmission,
  resourceFileHref,
  submissionFileHref,
  submissionUploadPath,
} from "~/features/courses/file-model";

// MDRS-287, MDRS-290: what tedris derives from a file. The browser reaches
// only this app's routes under /api/files/…, never tedrisat or the store.

const COURSE = "0b7f6c1e-2a4d-4c8e-9f10-3a5b6c7d8e9f";
const LESSON = "11111111-1111-4111-8111-111111111111";
const RESOURCE = "5d2e8f40-1c3b-4a6d-8e7f-90a1b2c3d4e5";

describe("resourceFileHref", () => {
  it("maps tedrisat's download route of a course's and a celse's file to this app's", () => {
    expect(
      resourceFileHref({
        downloadUrl: `/courses/${COURSE}/resources/${RESOURCE}/file`,
      })
    ).toBe(`/api/files/courses/${COURSE}/resources/${RESOURCE}`);
    expect(
      resourceFileHref({
        downloadUrl: `/lessons/${LESSON}/resources/${RESOURCE}/file`,
      })
    ).toBe(`/api/files/lessons/${LESSON}/resources/${RESOURCE}`);
  });

  it.each([
    "",
    "https://storage.bunnycdn.com/medaris/x.pdf",
    `//evil.test/courses/${COURSE}/resources/${RESOURCE}/file`,
    `/courses/${COURSE}/resources/${RESOURCE}/file?x=1`,
    `/courses/../resources/${RESOURCE}/file`,
    `/courses/${COURSE}/resources/${RESOURCE}`,
    `/lessons/${LESSON}/submission/files/${RESOURCE}`,
    "javascript:alert(1)",
  ])("links nothing for %j", (downloadUrl) => {
    expect(resourceFileHref({ downloadUrl })).toBeNull();
  });

  it("links nothing without a file", () => {
    expect(resourceFileHref(null)).toBeNull();
    expect(resourceFileHref(undefined)).toBeNull();
  });
});

describe("the homework routes", () => {
  it("adds at the celse's upload route and downloads one file by its id", () => {
    expect(submissionUploadPath(LESSON)).toBe(
      `/api/files/lessons/${LESSON}/submission/files`
    );
    expect(submissionFileHref(LESSON, RESOURCE)).toBe(
      `/api/files/lessons/${LESSON}/submission/files/${RESOURCE}`
    );
  });

  it("builds no download for an id that is not one", () => {
    expect(submissionFileHref(LESSON, "../x")).toBeNull();
    expect(submissionFileHref("x", RESOURCE)).toBeNull();
  });
});

// The chip, the size and the picker's types are @medaris/services/file-rules,
// pinned by its own spec; the glyph is this app's.
describe("a file's glyph", () => {
  it.each([
    ["application/pdf", "pdf"],
    ["image/png", "fileDownload"],
    ["image/jpeg", "fileDownload"],
    ["image/webp", "fileDownload"],
    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "doc",
    ],
    [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "fileXls",
    ],
    [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "doc",
    ],
    ["text/plain; charset=utf-8", "doc"],
  ])("draws %s as %s", (contentType, icon) => {
    expect(fileIcon(contentType)).toBe(icon);
  });

  it("draws a plain file for a type tedrisat does not store", () => {
    expect(fileIcon("image/svg+xml")).toBe("fileDownload");
    expect(fileIcon(undefined)).toBe("fileDownload");
  });
});

describe("parseSubmission", () => {
  it("turns the times of a homework read through fetch into dates", () => {
    const parsed = parseSubmission({
      id: "s1",
      lessonId: LESSON,
      note: null,
      createdAt: "2026-10-12T08:00:00.000Z",
      updatedAt: "2026-10-12T09:05:00.000Z",
      files: [
        {
          id: RESOURCE,
          name: "a.pdf",
          contentType: "application/pdf",
          sizeBytes: 3,
          createdAt: "2026-10-12T09:05:00.000Z",
          downloadUrl: `/lessons/${LESSON}/submission/files/${RESOURCE}`,
        },
      ],
    });
    expect(parsed.updatedAt).toEqual(new Date("2026-10-12T09:05:00.000Z"));
    expect(parsed.createdAt).toBeInstanceOf(Date);
    expect(parsed.files[0].createdAt).toBeInstanceOf(Date);
    expect(parsed.files[0].name).toBe("a.pdf");
  });
});

describe("fileErrorKey", () => {
  it.each([
    [413, "FILE_TOO_LARGE", "tooLarge"],
    [415, "FILE_TYPE_NOT_ALLOWED", "type"],
    [415, "MULTIPART_REQUIRED", "type"],
    [400, "FILE_REQUIRED", "empty"],
    [409, "SUBMISSION_FILE_LIMIT", "limit"],
    [403, "SUBMISSION_FORBIDDEN", "forbidden"],
    [503, "STORAGE_NOT_CONFIGURED", "storage"],
    [503, "STORAGE_UNAVAILABLE", "storage"],
    [404, "RESOURCE_FILE_NOT_FOUND", "notFound"],
    [404, "SUBMISSION_FILE_NOT_FOUND", "notFound"],
  ])("reads %i %s as %s", (status, code, key) => {
    expect(fileErrorKey(status, code)).toBe(key);
  });

  it("falls back on the status, and on 'failed'", () => {
    expect(fileErrorKey(413)).toBe("tooLarge");
    expect(fileErrorKey(415)).toBe("type");
    expect(fileErrorKey(409)).toBe("limit");
    expect(fileErrorKey(503)).toBe("storage");
    expect(fileErrorKey(502, "TEDRISAT_UNREACHABLE")).toBe("failed");
    expect(fileErrorKey(undefined)).toBe("failed");
  });
});
