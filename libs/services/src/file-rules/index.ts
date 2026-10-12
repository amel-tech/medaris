/**
 * `@medaris/services/file-rules`: tedrisat's file limits and allowed types,
 * the type chips and how a size reads (MDRS-287, MDRS-290). Client-safe on
 * purpose (no `server-only`): the pickers and lists of tedris, nazar and
 * nizam import it, and so does `@medaris/services/file-proxy`.
 */
export {
  ALLOWED_FILE_EXTENSIONS,
  ALLOWED_FILE_TYPES,
  type AllowedFileType,
  FILE_ACCEPT,
  FILE_TYPE_CHIPS,
  type FileTypeChip,
  fileTypeChip,
  formatFileSize,
  MAX_FILE_BYTES,
  MAX_SUBMISSION_FILES,
} from "./file-rules";
