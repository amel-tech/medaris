import { resources } from "@medaris/i18n";
import { MAX_FILE_BYTES } from "@medaris/services/file-rules";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fileErrorKey,
  fileKind,
  fileProblem,
  fileRoutes,
} from "~/features/files/files";

/**
 * Files as nazar shows and sends them (MDRS-287, MDRS-290): the limits it
 * checks before sending, the chip and size of a stored file, the routes, the
 * sentence a refusal gets, and `uploadFile`'s reading of each answer. `fetch`
 * is stubbed; `handleUnauthenticated` is the spy a 401 must reach.
 */
const signIn = vi.fn();
vi.mock("~/lib/unauthenticated", () => ({
  handleUnauthenticated: (result: unknown) => {
    signIn(result);
    return true;
  },
}));

const dig = (node: unknown, path: string) =>
  path
    .split(".")
    .reduce<unknown>(
      (n, part) => (n as Record<string, unknown> | undefined)?.[part],
      node
    );

// The limit, the chooser's types and how a size reads are
// @medaris/services/file-rules, pinned by its own spec.
describe("the limits checked before a file is sent", () => {
  it("refuse an empty file and one over 25 MB, and take one at the limit", () => {
    expect(fileProblem({ size: 0 })).toBe("empty");
    expect(fileProblem({ size: MAX_FILE_BYTES + 1 })).toBe("tooLarge");
    expect(fileProblem({ size: MAX_FILE_BYTES })).toBeNull();
    expect(fileProblem({ size: 1 })).toBeNull();
  });
});

describe("a stored file", () => {
  it("gets the chip of the type tedrisat read from its bytes", () => {
    expect(fileKind("application/pdf")).toBe("pdf");
    expect(fileKind("image/JPEG")).toBe("jpeg");
    expect(fileKind("text/plain; charset=utf-8")).toBe("text");
    expect(
      fileKind(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe("docx");
    expect(fileKind("application/octet-stream")).toBe("other");
  });

  it("has a chip and every message in all three languages", () => {
    for (const locale of ["tr", "en", "ar"] as const) {
      const files = resources[locale].nazar.Files as Record<string, unknown>;
      for (const kind of [
        "pdf",
        "png",
        "jpeg",
        "webp",
        "docx",
        "xlsx",
        "pptx",
        "text",
        "other",
      ]) {
        expect(dig(files, `kinds.${kind}`), `${locale} ${kind}`).toEqual(
          expect.any(String)
        );
      }
    }
  });
});

describe("the routes", () => {
  it("are this app's, one per tedrisat route, with their ids encoded", () => {
    expect(fileRoutes.courseResources("c-1")).toBe(
      "/api/files/courses/c-1/resources"
    );
    expect(fileRoutes.courseResource("c-1", "r/1")).toBe(
      "/api/files/courses/c-1/resources/r%2F1"
    );
    expect(fileRoutes.lessonResources("l-1")).toBe(
      "/api/files/lessons/l-1/resources"
    );
    expect(fileRoutes.lessonResource("l-1", "r-1")).toBe(
      "/api/files/lessons/l-1/resources/r-1"
    );
    expect(fileRoutes.submissionFile("c-1", "f-1")).toBe(
      "/api/files/courses/c-1/submissions/f-1"
    );
  });
});

describe("a refused upload", () => {
  it("is worded from its code, never with the server's message", () => {
    expect(fileErrorKey("FILE_TOO_LARGE")).toBe("Files.errors.tooLarge");
    expect(fileErrorKey("FILE_TYPE_NOT_ALLOWED")).toBe("Files.errors.type");
    expect(fileErrorKey("FILE_REQUIRED")).toBe("Files.errors.required");
    expect(fileErrorKey("STORAGE_NOT_CONFIGURED")).toBe(
      "Files.errors.notConfigured"
    );
    expect(fileErrorKey("STORAGE_UNAVAILABLE")).toBe(
      "Files.errors.unavailable"
    );
    expect(fileErrorKey("RESOURCE_FILE_NOT_FOUND")).toBe(
      "Files.errors.notFound"
    );
    expect(fileErrorKey("LESSON_NOT_FOUND")).toBe("Files.errors.lessonGone");
    expect(fileErrorKey("NETWORK")).toBe("Files.errors.network");
    expect(fileErrorKey("AUTHZ_FORBIDDEN")).toBe("Problems.actionForbidden");
    expect(fileErrorKey("SUBMISSION_FORBIDDEN")).toBe(
      "Problems.actionForbidden"
    );
    expect(fileErrorKey("SOMETHING_NEW")).toBe("Problems.actionGeneric");
  });

  it("has every sentence it can be given, in all three languages", () => {
    const codes = [
      "FILE_TOO_LARGE",
      "FILE_TYPE_NOT_ALLOWED",
      "FILE_REQUIRED",
      "MULTIPART_REQUIRED",
      "STORAGE_NOT_CONFIGURED",
      "STORAGE_UNAVAILABLE",
      "TEDRISAT_UNREACHABLE",
      "RESOURCE_FILE_NOT_FOUND",
      "LESSON_NOT_FOUND",
      "COURSE_NOT_FOUND",
      "VALIDATION_ERROR",
      "NETWORK",
      "AUTHZ_FORBIDDEN",
      "",
    ];
    for (const locale of ["tr", "en", "ar"] as const) {
      for (const code of codes) {
        expect(
          dig(resources[locale].nazar, fileErrorKey(code)),
          `${locale} ${code}`
        ).toEqual(expect.any(String));
      }
    }
  });
});

describe("uploadFile", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const file = () =>
    new File([new Uint8Array(64)], "bina.pdf", { type: "application/pdf" });
  const answer = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    signIn.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const upload = async () =>
    (await import("~/features/files/upload")).uploadFile(
      "/api/files/courses/c-1/resources",
      { file: file(), name: " Bina ", meta: "" }
    );

  it("posts the file as multipart field `file`, with the name it was given and no empty line", async () => {
    fetchMock.mockResolvedValue(
      answer(201, { resource: { id: "r-9" }, courseVersion: 8 })
    );
    expect(await upload()).toEqual({
      status: "ok",
      data: { resource: { id: "r-9" }, courseVersion: 8 },
    });
    const [route, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(route).toBe("/api/files/courses/c-1/resources");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect((body.get("file") as File).name).toBe("bina.pdf");
    expect(body.get("name")).toBe("Bina");
    expect(body.has("meta")).toBe(false);
  });

  it("reads a refusal's code: 413 and 415 come back as theirs", async () => {
    fetchMock.mockResolvedValueOnce(
      answer(413, { code: "FILE_TOO_LARGE", status: 413, message: "x" })
    );
    expect(await upload()).toEqual({
      status: "failed",
      code: "FILE_TOO_LARGE",
    });
    fetchMock.mockResolvedValueOnce(
      answer(415, { code: "FILE_TYPE_NOT_ALLOWED", status: 415 })
    );
    expect(await upload()).toEqual({
      status: "failed",
      code: "FILE_TYPE_NOT_ALLOWED",
    });
    // a body cut off in front of the app is read from its status
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 413 }));
    expect(await upload()).toEqual({
      status: "failed",
      code: "FILE_TOO_LARGE",
    });
  });

  it("hands a 401 to handleUnauthenticated and draws nothing else", async () => {
    fetchMock.mockResolvedValue(
      answer(401, { kind: "unauthenticated", reauth: true })
    );
    expect(await upload()).toEqual({ status: "signedOut" });
    expect(signIn).toHaveBeenCalledWith({
      kind: "unauthenticated",
      reauth: true,
    });
  });

  it("is NETWORK when no answer came", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await upload()).toEqual({ status: "failed", code: "NETWORK" });
    expect(signIn).not.toHaveBeenCalled();
  });
});
