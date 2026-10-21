/**
 * What every web app shows and checks about a file in Medaris storage
 * (MDRS-287, MDRS-290): tedrisat's limits, the types it stores, the chip of
 * each type and how a size reads. tedris, nazar and nizam each kept a copy of
 * these, and the proxy a fourth; one copy here means the limit a page checks
 * before sending and the one the proxy refuses at cannot drift apart.
 *
 * Nothing here touches a token, so a client component may import it.
 */

/** tedrisat's limit for one file, 25 MB: `MAX_UPLOAD_BYTES` in its `storage/upload.ts`. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** tedrisat's limit of files on one homework (409 SUBMISSION_FILE_LIMIT; MDRS-296). */
export const MAX_SUBMISSION_FILES = 10;

/**
 * The types tedrisat stores (`storage/file-type.ts`), as it reads them from a
 * file's bytes: PDF, PNG, JPEG, WebP, Word, Excel, PowerPoint and plain text.
 * Anything else is 415 FILE_TYPE_NOT_ALLOWED.
 */
export const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
] as const;

export type AllowedFileType = (typeof ALLOWED_FILE_TYPES)[number];

/** The same types by the extensions people's files carry. */
export const ALLOWED_FILE_EXTENSIONS = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".docx",
  ".xlsx",
  ".pptx",
  ".txt",
] as const;

/**
 * A file input's `accept`: the extensions, then the types. Only a hint to the
 * browser's picker, which can still be told to show every file; tedrisat reads
 * the type from the bytes.
 */
export const FILE_ACCEPT = [
  ...ALLOWED_FILE_EXTENSIONS,
  ...ALLOWED_FILE_TYPES,
].join(",");

/** A file's type as people know it, the same in every language. */
export type FileTypeChip =
  | "PDF"
  | "PNG"
  | "JPEG"
  | "WEBP"
  | "DOCX"
  | "XLSX"
  | "PPTX"
  | "TXT";

/** The chip of each type tedrisat stores. */
export const FILE_TYPE_CHIPS: Readonly<Record<AllowedFileType, FileTypeChip>> =
  {
    "application/pdf": "PDF",
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/webp": "WEBP",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "DOCX",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      "PPTX",
    "text/plain": "TXT",
  };

/**
 * The chip of a stored file, from the `Content-Type` tedrisat read from its
 * bytes; parameters and case do not count (tedrisat stores plain text as
 * `text/plain; charset=utf-8`). Null for a type it does not store.
 */
export const fileTypeChip = (
  contentType: string | null | undefined
): FileTypeChip | null => {
  const bare = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return Object.hasOwn(FILE_TYPE_CHIPS, bare)
    ? FILE_TYPE_CHIPS[bare as AllowedFileType]
    : null;
};

const SIZE_UNITS = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;

/**
 * A file's size in the page's language, counted in steps of 1024 as the limit
 * is (25 MB is 25 × 1024 × 1024 bytes, so a file at the limit reads "25 MB"
 * and not "26,2 MB"): whole bytes and kilobytes, larger units to one decimal.
 * A locale `Intl` does not know falls back on Turkish.
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

/**
 * The query parameter a failed download comes back to its page with. A
 * download is a plain link, so a refusal cannot be answered as JSON the page
 * reads: the file proxy sends the browser back to the page instead, which
 * says why (`@medaris/services/file-proxy`).
 */
export const FILE_ERROR_PARAM = "fileError";

/**
 * Why a download failed, as `?fileError=` names it: four reasons the pages
 * word, never tedrisat's own codes, so an address carries nothing internal.
 */
export const FILE_DOWNLOAD_ERRORS = [
  "forbidden",
  "notFound",
  "unavailable",
  "failed",
] as const;

export type FileDownloadError = (typeof FILE_DOWNLOAD_ERRORS)[number];

/** `?fileError=`'s value when it is one of the four, else null. */
export const fileDownloadError = (value: unknown): FileDownloadError | null =>
  typeof value === "string" &&
  (FILE_DOWNLOAD_ERRORS as readonly string[]).includes(value)
    ? (value as FileDownloadError)
    : null;

/** The reason for a refused download, by its HTTP status. */
export const fileDownloadErrorOf = (status: number): FileDownloadError => {
  if (status === 403) return "forbidden";
  if (status === 400 || status === 404 || status === 410) return "notFound";
  if (status === 502 || status === 503 || status === 504) return "unavailable";
  return "failed";
};
