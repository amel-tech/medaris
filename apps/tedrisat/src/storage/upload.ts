import { MedarisError } from "@medaris/common";
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  PayloadTooLargeException,
} from "@nestjs/common";
import {
  FileInterceptor,
  type MulterModuleOptions,
} from "@nestjs/platform-express";
import type { Request } from "express";
import { sanitizeFileName } from "./file-name";
import { sniffFileType } from "./file-type";
import { ObjectStorage } from "./object-storage";

/** The largest file tedrisat stores: 25 MB (MDRS-287, MDRS-290). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * What a multipart body may carry besides the file: the boundaries, the
 * parts' headers and a few short fields (a resource's name and line). A body
 * announcing more than the file limit plus this is refused before a byte of
 * it is read.
 */
const MULTIPART_ALLOWANCE_BYTES = 64 * 1024;

export class FileTooLargeError extends MedarisError {
  static readonly code = "FILE_TOO_LARGE";

  constructor() {
    super(
      FileTooLargeError.code,
      413,
      `A file may be at most ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`,
      { maxBytes: MAX_UPLOAD_BYTES }
    );
  }
}

export class FileTypeNotAllowedError extends MedarisError {
  static readonly code = "FILE_TYPE_NOT_ALLOWED";

  constructor() {
    super(
      FileTypeNotAllowedError.code,
      415,
      "Only PDF, PNG, JPEG, WebP, Word (docx), Excel (xlsx), PowerPoint (pptx) and plain text files are accepted"
    );
  }
}

export class FileRequiredError extends MedarisError {
  static readonly code = "FILE_REQUIRED";

  constructor() {
    super(
      FileRequiredError.code,
      400,
      "Send the file as the multipart field `file`, and not empty"
    );
  }
}

/**
 * Multer's settings for every upload route: one file in memory under the
 * field `file`, cut off one byte past the limit (multer then answers 413),
 * a handful of short fields, and file names read as UTF-8, which is what
 * browsers send (multer's default, latin1, turns "ödev.pdf" into mojibake).
 */
export const UPLOAD_MULTER_OPTIONS: MulterModuleOptions = {
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
    fields: 4,
    fieldSize: 1024,
    parts: 6,
    headerPairs: 20,
  },
  defParamCharset: "utf8",
};

/**
 * The one interceptor of every upload route (MDRS-287): a server without
 * storage answers 503 before the body is read, a body whose `Content-Length`
 * is already past the limit answers 413 FILE_TOO_LARGE without being read at
 * all, and otherwise Nest's own `FileInterceptor` parses it with
 * `UPLOAD_MULTER_OPTIONS`. A body without a length (chunked) is cut off by
 * multer as it streams, one byte past the limit; that 413 gets the same code
 * here. Only the parsing's errors are mapped, not the handler's.
 *
 * The guards have run by then (`@Authz` before any interceptor), so nobody
 * without the permission gets a byte buffered.
 */
@Injectable()
export class UploadGateInterceptor implements NestInterceptor {
  private readonly multipart: NestInterceptor = new (FileInterceptor(
    "file",
    UPLOAD_MULTER_OPTIONS
  ))();

  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly storage: ObjectStorage) {}

  // Returns a promise of the handler's stream rather than piping through
  // rxjs, which is not a direct dependency of this app; Nest accepts either.
  async intercept(
    context: ExecutionContext,
    next: CallHandler
  ): Promise<ReturnType<CallHandler["handle"]>> {
    this.storage.assertConfigured();
    const request = context.switchToHttp().getRequest<Request>();
    const announced = Number(request.headers["content-length"]);
    if (
      Number.isFinite(announced) &&
      announced > MAX_UPLOAD_BYTES + MULTIPART_ALLOWANCE_BYTES
    ) {
      throw new FileTooLargeError();
    }
    try {
      return await this.multipart.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) {
        throw new FileTooLargeError();
      }
      throw error;
    }
  }
}

/** An upload that passed every check, ready to be stored. */
export interface IAcceptedFile {
  body: Buffer;
  contentType: string;
  /** The sanitised name (`sanitizeFileName`). */
  fileName: string;
  size: number;
}

/**
 * The checks on the file itself, once multer has it in memory: present and
 * not empty, within the limit, and one of the accepted types by its bytes. The
 * name it is stored under is the sanitised one, its extension the type's.
 */
export function acceptUpload(
  file: Express.Multer.File | undefined
): IAcceptedFile {
  if (!file?.buffer || file.size === 0) throw new FileRequiredError();
  if (file.size > MAX_UPLOAD_BYTES) throw new FileTooLargeError();
  const type = sniffFileType(file.buffer);
  if (!type) throw new FileTypeNotAllowedError();
  return {
    body: file.buffer,
    contentType: type.contentType,
    fileName: sanitizeFileName(file.originalname, type),
    size: file.size,
  };
}
