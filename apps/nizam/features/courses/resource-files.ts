import { isUnauthenticated, type Unauthenticated } from "@medaris/auth/client";

/**
 * Resource files on the curriculum (MDRS-287): the app's own routes a file
 * goes up and comes down through, what the picker offers, the checks made
 * before a byte is sent, and the words for what tedrisat refuses. The browser
 * holds no token, so it never talks to tedrisat: `app/api/files/…` adds the
 * token on the server and streams the body on (`@medaris/services/file-proxy`).
 * Nothing here is server-only, so the editors import it.
 */

/**
 * tedrisat's limit for one file, 25 MB (`MAX_FILE_BYTES` of
 * `@medaris/services/file-proxy`, which is server-only and cannot be imported
 * here). Checked before sending so a file that is too large is refused at
 * once rather than after it has gone up; the server still enforces it.
 */
export const MAX_RESOURCE_FILE_BYTES = 25 * 1024 * 1024;

/**
 * What the picker offers: tedrisat's allow-list (PDF, PNG, JPEG, WebP, Word,
 * Excel, PowerPoint, plain text) by extension and by type. A picker can still
 * be told to show every file; tedrisat reads the type from the bytes.
 */
export const RESOURCE_FILE_ACCEPT = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".docx",
  ".xlsx",
  ".pptx",
  ".txt",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
].join(",");

const id = (value: string) => encodeURIComponent(value);

/** Where a file of the course's own resources is uploaded (POST). */
export const courseResourceUploadPath = (courseId: string): string =>
  `/api/files/courses/${id(courseId)}/resources`;

/** Where a file of the course's own resources is downloaded (a plain link). */
export const courseResourceFilePath = (
  courseId: string,
  resourceId: string
): string => `/api/files/courses/${id(courseId)}/resources/${id(resourceId)}`;

/** Where a file of a session's own resources is uploaded (POST). */
export const lessonResourceUploadPath = (lessonId: string): string =>
  `/api/files/lessons/${id(lessonId)}/resources`;

/** Where a file of a session's own resources is downloaded (a plain link). */
export const lessonResourceFilePath = (
  lessonId: string,
  resourceId: string
): string => `/api/files/lessons/${id(lessonId)}/resources/${id(resourceId)}`;

const KINDS: Readonly<Record<string, string>> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "PPTX",
  "text/plain": "TXT",
};

/**
 * The type chip of a file: from the type tedrisat read from its bytes, else
 * its name's extension; null when neither says (the chip then reads "Dosya").
 */
export function fileKind(contentType: string, fileName: string): string | null {
  const base = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  const known = KINDS[base];
  if (known) return known;
  const extension = /\.([A-Za-z0-9]{1,8})$/.exec(fileName)?.[1];
  return extension ? extension.toUpperCase() : null;
}

const SIZE_UNITS = ["byte", "kilobyte", "megabyte"] as const;

/**
 * A file's size in the page's language: "1,4 MB". Counted in 1024s, as the
 * 25 MB limit is, so a file at the limit reads "25 MB" and not "26,2 MB".
 */
export function formatFileSize(bytes: number, locale: string): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const options: Intl.NumberFormatOptions = {
    style: "unit",
    unit: SIZE_UNITS[unit],
    unitDisplay: "short",
    maximumFractionDigits: unit < 2 ? 0 : 1,
  };
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return new Intl.NumberFormat("tr-TR", options).format(value);
  }
}

/** The `uploadErrors.*` key of a refused upload. */
export type UploadErrorKey =
  | "required"
  | "empty"
  | "tooLarge"
  | "typeNotAllowed"
  | "storageNotConfigured"
  | "storageUnavailable"
  | "forbidden"
  | "gone"
  | "unreachable"
  | "generic";

/** The refusals that are about the chosen file, shown on its field. */
export const FILE_FIELD_ERRORS: ReadonlySet<UploadErrorKey> = new Set([
  "required",
  "empty",
  "tooLarge",
  "typeNotAllowed",
]);

/** What stops a file before it is sent; null when it may go. */
export function fileProblem(
  file: Pick<File, "size"> | null
): UploadErrorKey | null {
  if (!file) return "required";
  if (file.size === 0) return "empty";
  if (file.size > MAX_RESOURCE_FILE_BYTES) return "tooLarge";
  return null;
}

const UPLOAD_CODES: Readonly<Record<string, UploadErrorKey>> = {
  FILE_TOO_LARGE: "tooLarge",
  FILE_TYPE_NOT_ALLOWED: "typeNotAllowed",
  FILE_REQUIRED: "empty",
  STORAGE_NOT_CONFIGURED: "storageNotConfigured",
  STORAGE_UNAVAILABLE: "storageUnavailable",
  AUTHZ_FORBIDDEN: "forbidden",
  COURSE_NOT_FOUND: "gone",
  LESSON_NOT_FOUND: "gone",
  NOT_FOUND: "gone",
  TEDRISAT_UNREACHABLE: "unreachable",
};

/**
 * The words for a refused upload: tedrisat's code (passed on as it is by the
 * route), else the status alone, for an answer from something in front of
 * the app that carries no code (a 413 from a reverse proxy).
 */
export function uploadErrorKey(status: number, body: unknown): UploadErrorKey {
  const code =
    typeof body === "object" && body !== null
      ? (body as { code?: unknown }).code
      : undefined;
  if (typeof code === "string" && Object.hasOwn(UPLOAD_CODES, code)) {
    return UPLOAD_CODES[code] as UploadErrorKey;
  }
  switch (status) {
    case 413:
      return "tooLarge";
    case 415:
      return "typeNotAllowed";
    case 403:
      return "forbidden";
    case 404:
      return "gone";
    case 503:
      return "storageUnavailable";
    case 502:
    case 504:
      return "unreachable";
    default:
      return "generic";
  }
}

/** What an upload's route answered, for the dialog to act on. */
export type UploadOutcome<R> =
  | { kind: "uploaded"; resource: R; courseVersion: number }
  /** the session is over: the body goes to `handleUnauthenticated` */
  | { kind: "signIn"; body: Unauthenticated }
  | { kind: "refused"; error: UploadErrorKey };

/**
 * Sends one file to an upload route of this app as `multipart/form-data`:
 * the field `file`, and the listed name and short line when typed (tedrisat
 * names the row after the file otherwise). 201 carries the new row and the
 * course's version after it; a 401 is the "sign in again" answer; anything
 * else is a refusal worded by `uploadErrorKey`.
 */
export async function uploadResourceFile<R>(
  path: string,
  input: { file: File; name: string; meta: string },
  send: typeof fetch = fetch
): Promise<UploadOutcome<R>> {
  const body = new FormData();
  body.append("file", input.file, input.file.name);
  const name = input.name.trim();
  const meta = input.meta.trim();
  if (name) body.append("name", name);
  if (meta) body.append("meta", meta);
  let response: Response;
  try {
    response = await send(path, {
      method: "POST",
      body,
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
  } catch {
    return { kind: "refused", error: "unreachable" };
  }
  const json: unknown = await response.json().catch(() => null);
  if (response.status === 401 && isUnauthenticated(json)) {
    return { kind: "signIn", body: json };
  }
  if (response.ok) {
    const answer = json as { resource?: R; courseVersion?: unknown } | null;
    if (answer?.resource && typeof answer.courseVersion === "number") {
      return {
        kind: "uploaded",
        resource: answer.resource,
        courseVersion: answer.courseVersion,
      };
    }
    return { kind: "refused", error: "generic" };
  }
  return { kind: "refused", error: uploadErrorKey(response.status, json) };
}
