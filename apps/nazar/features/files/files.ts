import {
  type FileTypeChip,
  fileTypeChip,
  MAX_FILE_BYTES,
} from "@medaris/services/file-rules";

/**
 * Files in Medaris storage as nazar shows and sends them (MDRS-287, MDRS-290):
 * the course's and a celse's resource files, and the homework talebe hand in.
 * The browser never talks to tedrisat: an upload goes to this app's own route
 * under `/api/files/…`, which adds the caller's token and streams the body on
 * (`@medaris/services/file-proxy`), and a download is a plain link to the same
 * routes. Pure on purpose, so the editors and the Ödevler page have nothing to
 * decide.
 *
 * The limit, the chooser's types (`FILE_ACCEPT`), the type of a file and how
 * its size reads (`formatFileSize`, in steps of 1024 as the limit is) are
 * `@medaris/services/file-rules`, shared with tedris, nizam and the file
 * proxy. Recordings keep their own decimal `formatBytes`: their limit is a
 * decimal 10 GB.
 */

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

/** The key of a file's chip under `Files.kinds`, worded per language. */
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

const KINDS: Readonly<Record<FileTypeChip, FileKind>> = {
  PDF: "pdf",
  PNG: "png",
  JPEG: "jpeg",
  WEBP: "webp",
  DOCX: "docx",
  XLSX: "xlsx",
  PPTX: "pptx",
  TXT: "text",
};

/** The chip of a file's type, from the type tedrisat read from its bytes. */
export const fileKind = (contentType: string): FileKind => {
  const chip = fileTypeChip(contentType);
  return chip ? KINDS[chip] : "other";
};

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
