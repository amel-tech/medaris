import { type FileTypeChip, fileTypeChip } from "@medaris/services/file-rules";
import type {
  LessonAssignmentFileResponse,
  LessonSubmissionResponse,
  ResourceFileResponse,
  SubmissionFileResponse,
} from "@medaris/services/tedrisat";
import type { IconName } from "@medaris/ui/mds/icon";

/**
 * Files in tedris (MDRS-287, MDRS-290): a course's or a celse's resource file
 * to download, a file of the homework set on a celse, and the talebe's own
 * homework on a celse. Pure, so a spec pins
 * every rule; the browser never reaches tedrisat or the store itself, only
 * this app's routes under `/api/files/…`, which add the token on the server.
 */

/**
 * The limits, the picker's types, the type chips and how a size reads are
 * `@medaris/services/file-rules`, shared with nazar, nizam and the file proxy.
 * The answer to `GET /lessons/:id/submission` carries the limits too, and the
 * card takes those when it has them.
 */

/** tedrisat's limit on a homework's note, after trimming. */
export const SUBMISSION_NOTE_MAX = 4000;

/** The glyph of each type chip; a type tedrisat does not store has none. */
const FILE_ICONS: Record<FileTypeChip, IconName> = {
  PDF: "pdf",
  PNG: "fileDownload",
  JPEG: "fileDownload",
  WEBP: "fileDownload",
  DOCX: "doc",
  XLSX: "fileXls",
  PPTX: "doc",
  TXT: "doc",
};

/** The glyph of a file's row: a PDF, a sheet, a picture or a document. */
export const fileIcon = (contentType: string | null | undefined): IconName => {
  const chip = fileTypeChip(contentType);
  return chip ? FILE_ICONS[chip] : "fileDownload";
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

const ASSIGNMENT_FILE = new RegExp(
  `^/lessons/(${UUID})/assignment/files/(${UUID})$`
);

/**
 * This app's download route for a file of the homework set on a celse, from
 * the tedrisat route the API names for it (`/lessons/:id/assignment/files/:fid`):
 * `/api/files/lessons/:id/assignment/:fid`. Anything else is no link.
 */
export const assignmentFileHref = (
  file: Pick<LessonAssignmentFileResponse, "downloadUrl"> | null | undefined
): string | null => {
  const match = ASSIGNMENT_FILE.exec(file?.downloadUrl ?? "");
  return match ? `/api/files/lessons/${match[1]}/assignment/${match[2]}` : null;
};

/**
 * Whether the talebe has handed their homework in: a note or at least one
 * file, as tedrisat counts it for the course page and for Ödevler. A
 * submission emptied since is not.
 */
export const isHandedIn = (
  submission:
    | Pick<LessonSubmissionResponse, "note" | "files">
    | null
    | undefined
): boolean =>
  Boolean(
    submission && (submission.files.length > 0 || submission.note?.trim())
  );

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
