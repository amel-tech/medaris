/**
 * Files in Medaris storage as nazar shows and sends them (MDRS-287, MDRS-290):
 * the course's and a celse's resource files, and the homework talebe hand in.
 * The browser never talks to tedrisat: an upload goes to this app's own route
 * under `/api/files/…`, which adds the caller's token and streams the body on
 * (`@medaris/services/file-proxy`), and a download is a plain link to the same
 * routes. Pure on purpose, so the editors and the Ödevler page have nothing to
 * decide.
 */

/**
 * The largest file tedrisat takes, 25 MB (`MAX_UPLOAD_BYTES` in its
 * `storage/upload.ts`, `MAX_FILE_BYTES` in the file proxy). Kept here because
 * the proxy's module is server-only; `test/files.spec.ts` pins the two equal.
 * A larger file is refused before it is sent; the server refuses it anyway.
 */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * What the file chooser offers: the types tedrisat accepts (PDF, PNG, JPEG,
 * WebP, Word, Excel, PowerPoint and plain text), by extension and by type.
 * Only a hint to the browser: tedrisat reads the type from the file's bytes.
 */
export const FILE_ACCEPT = [
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

/** A stored file as a row shows it: tedrisat's `file` without its own path. */
export interface StoredFile {
  name: string;
  contentType: string;
  sizeBytes: number;
}

export const storedFileOf = (file: StoredFile): StoredFile => ({
  name: file.name,
  contentType: file.contentType,
  sizeBytes: file.sizeBytes,
});

export type FileKind =
  | "pdf"
  | "png"
  | "jpeg"
  | "webp"
  | "docx"
  | "xlsx"
  | "pptx"
  | "text"
  | "other";

const KINDS: Readonly<Record<string, FileKind>> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/webp": "webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "text/plain": "text",
};

/** The chip of a file's type, from the type tedrisat read from its bytes. */
export const fileKind = (contentType: string): FileKind =>
  KINDS[(contentType.split(";")[0] ?? "").trim().toLowerCase()] ?? "other";

const UNITS = ["byte", "kilobyte", "megabyte"] as const;

/**
 * A file's size in the page's language: "840 kB", "1,2 MB". Counted in steps
 * of 1024, as the 25 MB limit is, so a file at the limit reads "25 MB".
 */
export function fileSize(bytes: number, locale: string): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const options: Intl.NumberFormatOptions = {
    style: "unit",
    unit: UNITS[unit],
    unitDisplay: "short",
    maximumFractionDigits: unit < 2 ? 0 : 1,
  };
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return new Intl.NumberFormat("tr-TR", options).format(value);
  }
}

// ---- this app's routes ------------------------------------------------------------

const seg = encodeURIComponent;

/** The routes under `app/api/files`, each the twin of a tedrisat route. */
export const fileRoutes = {
  /** POST: a file as one of the course's resources (`course.edit`) */
  courseResources: (courseId: string) =>
    `/api/files/courses/${seg(courseId)}/resources`,
  /** GET: that file, for a reader of the course's content */
  courseResource: (courseId: string, resourceId: string) =>
    `/api/files/courses/${seg(courseId)}/resources/${seg(resourceId)}`,
  /** POST: a file as one of a celse's own resources (`session.manage`) */
  lessonResources: (lessonId: string) =>
    `/api/files/lessons/${seg(lessonId)}/resources`,
  /** GET: that file, for a reader of the course's content */
  lessonResource: (lessonId: string, resourceId: string) =>
    `/api/files/lessons/${seg(lessonId)}/resources/${seg(resourceId)}`,
  /** GET: a file a talebe handed in, for a holder of `submission.read` */
  submissionFile: (courseId: string, fileId: string) =>
    `/api/files/courses/${seg(courseId)}/submissions/${seg(fileId)}`,
} as const;

// ---- before a file is sent ------------------------------------------------------------

export type FileProblem = "empty" | "tooLarge";

/** Why a chosen file is not sent: tedrisat refuses an empty one and one over 25 MB. */
export const fileProblem = (file: Pick<File, "size">): FileProblem | null =>
  file.size === 0 ? "empty" : file.size > MAX_FILE_BYTES ? "tooLarge" : null;

// ---- what the API refuses ----------------------------------------------------------

/**
 * The message key (from the catalogue's root) of a refused upload, from the
 * code tedrisat or the file proxy answered with. The server's message never
 * reaches the page.
 */
export function fileErrorKey(code: string): string {
  switch (code) {
    case "FILE_TOO_LARGE":
      return "Files.errors.tooLarge";
    case "FILE_TYPE_NOT_ALLOWED":
      return "Files.errors.type";
    case "FILE_REQUIRED":
    case "MULTIPART_REQUIRED":
      return "Files.errors.required";
    case "STORAGE_NOT_CONFIGURED":
      return "Files.errors.notConfigured";
    case "STORAGE_UNAVAILABLE":
    case "TEDRISAT_UNREACHABLE":
      return "Files.errors.unavailable";
    case "RESOURCE_FILE_NOT_FOUND":
      return "Files.errors.notFound";
    case "LESSON_NOT_FOUND":
      return "Files.errors.lessonGone";
    case "COURSE_NOT_FOUND":
      return "Files.errors.courseGone";
    case "VALIDATION_ERROR":
      return "Files.errors.invalid";
    case "NETWORK":
      return "Files.errors.network";
    case "AUTHZ_FORBIDDEN":
    case "SUBMISSION_FORBIDDEN":
      return "Problems.actionForbidden";
    default:
      return "Problems.actionGeneric";
  }
}
