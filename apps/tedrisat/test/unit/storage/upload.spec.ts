import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { StorageNotConfiguredError } from "../../../src/storage/object-storage";
import {
  acceptUpload,
  FileRequiredError,
  FileTooLargeError,
  FileTypeNotAllowedError,
  MAX_UPLOAD_BYTES,
  UploadGateInterceptor,
} from "../../../src/storage/upload";
import { MemoryObjectStorage } from "../../helpers/memory-object-storage";
import { html, pdf } from "../../helpers/upload-fixtures";

const multerFile = (
  buffer: Buffer,
  originalname = "ödev.pdf",
  size = buffer.length
): Express.Multer.File =>
  ({
    buffer,
    originalname,
    size,
    mimetype: "application/octet-stream",
  }) as Express.Multer.File;

const contextWith = (headers: Record<string, string>): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
      getResponse: () => ({}),
    }),
  }) as unknown as ExecutionContext;

const next: CallHandler = { handle: () => ({}) as never };

/** MDRS-287 / MDRS-290: at most 25 MB per file, refused as early as can be. */
describe("the upload limit and checks (MDRS-287)", () => {
  it("is 25 MB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
  });

  it("accepts a file within the limit, typed by its bytes and named by the sanitiser", () => {
    const accepted = acceptUpload(multerFile(pdf(), "Ödev‮.html"));
    expect(accepted).toEqual({
      body: pdf(),
      contentType: "application/pdf",
      fileName: "Ödev.html.pdf",
      size: pdf().length,
    });
  });

  it("refuses a file one byte past the limit", () => {
    const body = Buffer.concat([pdf(), Buffer.alloc(MAX_UPLOAD_BYTES)]);
    expect(() => acceptUpload(multerFile(body))).toThrow(FileTooLargeError);
    const exact = Buffer.concat([
      pdf(),
      Buffer.alloc(MAX_UPLOAD_BYTES - pdf().length),
    ]);
    expect(acceptUpload(multerFile(exact)).size).toBe(MAX_UPLOAD_BYTES);
  });

  it("refuses no file, an empty one, and one of a type not on the list", () => {
    expect(() => acceptUpload(undefined)).toThrow(FileRequiredError);
    expect(() => acceptUpload(multerFile(Buffer.alloc(0)))).toThrow(
      FileRequiredError
    );
    expect(() => acceptUpload(multerFile(html(), "notes.pdf"))).toThrow(
      FileTypeNotAllowedError
    );
  });

  it("answers 413 for a body that announces more than the limit, before multer reads a byte", async () => {
    const gate = new UploadGateInterceptor(new MemoryObjectStorage());
    await expect(
      gate.intercept(
        contextWith({
          "content-length": String(MAX_UPLOAD_BYTES + 128 * 1024),
        }),
        next
      )
    ).rejects.toBeInstanceOf(FileTooLargeError);
  });

  it("answers 503 on a server without storage, before the body is read", async () => {
    const gate = new UploadGateInterceptor(
      new MemoryObjectStorage("test", false)
    );
    await expect(
      gate.intercept(contextWith({ "content-length": "10" }), next)
    ).rejects.toBeInstanceOf(StorageNotConfiguredError);
  });
});
