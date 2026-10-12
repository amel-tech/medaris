import type {
  LessonSubmissionResponse,
  ResourceFileResponse,
  SubmissionFileResponse,
} from "@medaris/services/tedrisat";
import type { IconName } from "@medaris/ui/mds/icon";

/**
 * Files in tedris (MDRS-287, MDRS-290): a course's or a celse's resource file
 * to download, and the talebe's own homework on a celse. Pure, so a spec pins
 * every rule; the browser never reaches tedrisat or the store itself, only
 * this app's routes under `/api/files/…`, which add the token on the server.
 */

/**
 * tedrisat's limit for one file, 25 MB (`MAX_UPLOAD_BYTES`; the proxy's
 * `MAX_FILE_BYTES`, which a client component cannot import: it is
 * server-only). The answer to `GET /lessons/:id/submission` carries the
 * limits too, and the card takes those when it has them.
 */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** tedrisat's limit of files on one homework (409 SUBMISSION_FILE_LIMIT). */
export const MAX_SUBMISSION_FILES = 5;

/** tedrisat's limit on a homework's note, after trimming. */
export const SUBMISSION_NOTE_MAX = 4000;

/**
 * What the file picker offers: tedrisat's allow-list (PDF, PNG, JPEG, WebP,
 * Word, Excel, PowerPoint, plain text), by extension and by type. Only a hint
 * to the browser: tedrisat reads the type from the file's bytes and refuses
 * anything else with 415 FILE_TYPE_NOT_ALLOWED.
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

/** The chip and the glyph of each type tedrisat stores, by its `Content-Type`. */
const FILE_TYPES: Record<string, { label: string; icon: IconName }> = {
  "application/pdf": { label: "PDF", icon: "pdf" },
  "image/png": { label: "PNG", icon: "fileDownload" },
  "image/jpeg": { label: "JPEG", icon: "fileDownload" },
  "image/webp": { label: "WEBP", icon: "fileDownload" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    label: "DOCX",
    icon: "doc",
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    label: "XLSX",
    icon: "fileXls",
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    label: "PPTX",
    icon: "doc",
  },
  "text/plain": { label: "TXT", icon: "doc" },
};

/** The type without its parameters: `text/plain; charset=utf-8` is `text/plain`. */
const bareType = (contentType: string | null | undefined): string =>
  (contentType ?? "").split(";")[0].trim().toLowerCase();

/**
 * The chip a file carries, its extension as people know it (`PDF`, `DOCX`):
 * the same in every language. Null for a type tedrisat does not store.
 */
export const fileTypeLabel = (
  contentType: string | null | undefined
): string | null => FILE_TYPES[bareType(contentType)]?.label ?? null;

/** The glyph of a file's row: a PDF, a sheet, a picture or a document. */
export const fileIcon = (contentType: string | null | undefined): IconName =>
  FILE_TYPES[bareType(contentType)]?.icon ?? "fileDownload";

const SIZE_UNITS = ["byte", "kilobyte", "megabyte"] as const;

/**
 * A file's size in the page's language, in binary steps as the limit is
 * counted (25 MB is 25 × 1024 × 1024 bytes, so a file at the limit reads
 * "25 MB" and not "26,2 MB"): whole bytes and kilobytes, megabytes to one
 * decimal.
 */
export const formatFileSize = (bytes: number, locale: string): string => {
  let value = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
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
};

const UUID =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const UUID_ONLY = new RegExp(`^${UUID}$`);
const RESOURCE_FILE = new RegExp(
  `^/(courses|lessons)/(${UUID})/resources/(${UUID})/file$`
);

/**
 * This app's download route for a resource's file, from the tedrisat route
 * the API names for it (`file.downloadUrl`: `/courses/:id/resources/:rid/file`
 * or `/lessons/:id/resources/:rid/file`): `/api/files/courses/:id/resources/:rid`
 * or `/api/files/lessons/:id/resources/:rid`. Anything else is no link, so a
 * value the API never sends cannot become an href.
 */
export const resourceFileHref = (
  file: Pick<ResourceFileResponse, "downloadUrl"> | null | undefined
): string | null => {
  const match = RESOURCE_FILE.exec(file?.downloadUrl ?? "");
  return match
    ? `/api/files/${match[1]}/${match[2]}/resources/${match[3]}`
    : null;
};

/** Where the talebe's homework files are added: `POST`, multipart `file`. */
export const submissionUploadPath = (lessonId: string): string =>
  `/api/files/lessons/${lessonId}/submission/files`;

/** One of the talebe's own homework files, to download; null for ids that are not. */
export const submissionFileHref = (
  lessonId: string,
  fileId: string
): string | null =>
  UUID_ONLY.test(lessonId) && UUID_ONLY.test(fileId)
    ? `${submissionUploadPath(lessonId)}/${fileId}`
    : null;

/**
 * The homework as `POST …/submission/files` answers it, through `fetch` and
 * not the generated client: its times arrive as strings and become dates.
 */
export const parseSubmission = (json: unknown): LessonSubmissionResponse => {
  const body = json as LessonSubmissionResponse & {
    files?: SubmissionFileResponse[];
  };
  return {
    ...body,
    note: body.note ?? null,
    createdAt: new Date(body.createdAt),
    updatedAt: new Date(body.updatedAt),
    files: (body.files ?? []).map((file) => ({
      ...file,
      createdAt: new Date(file.createdAt),
    })),
  };
};

/** The message keys (under `tedrisLearn.Homework.errors`) a refused file is said with. */
export type FileErrorKey =
  | "tooLarge"
  | "type"
  | "empty"
  | "limit"
  | "forbidden"
  | "storage"
  | "notFound"
  | "failed";

/**
 * Why a file could not be added or removed, in the page's own words: by
 * tedrisat's code (or the proxy's, shaped the same), else by the status.
 */
export const fileErrorKey = (
  status: number | undefined,
  code?: unknown
): FileErrorKey => {
  switch (code) {
    case "FILE_TOO_LARGE":
      return "tooLarge";
    case "FILE_TYPE_NOT_ALLOWED":
    case "MULTIPART_REQUIRED":
      return "type";
    case "FILE_REQUIRED":
      return "empty";
    case "SUBMISSION_FILE_LIMIT":
      return "limit";
    case "SUBMISSION_FORBIDDEN":
      return "forbidden";
    case "STORAGE_NOT_CONFIGURED":
    case "STORAGE_UNAVAILABLE":
      return "storage";
    case "SUBMISSION_FILE_NOT_FOUND":
    case "RESOURCE_FILE_NOT_FOUND":
    case "LESSON_NOT_FOUND":
      return "notFound";
  }
  switch (status) {
    case 413:
      return "tooLarge";
    case 415:
      return "type";
    case 409:
      return "limit";
    case 403:
      return "forbidden";
    case 503:
      return "storage";
    case 404:
      return "notFound";
    default:
      return "failed";
  }
};
