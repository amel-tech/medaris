import type {
  lessonAssignmentFiles,
  lessonAssignments,
} from "../../database/schema/lesson-assignment.schema";

type AssignmentRow = typeof lessonAssignments.$inferSelect;
type AssignmentFileRow = typeof lessonAssignmentFiles.$inferSelect;

/**
 * A file of a celse's homework as a response carries it. Course content, like
 * a resource's file (MDRS-287): only a reader of the course's content is sent
 * it. The storage key never leaves tedrisat; the file is fetched through
 * `downloadUrl`.
 */
export interface ILessonAssignmentFile {
  id: string;
  /** The sanitised name it was uploaded under, which its download is saved as. */
  name: string;
  /** The type read from its bytes when it was uploaded. */
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
  /** tedrisat's download route for it, a path from the API's root. */
  downloadUrl: string;
}

/**
 * The homework a müderris set on a celse ("Bu celsenin ödevi var"): its
 * description and its own files, oldest first. Kept apart from the celse's
 * resources: a homework file is never a resource, nor a resource a homework
 * file. Course content as a whole, whether the celse has homework included: a
 * caller who may not read the content is not told.
 */
export interface ILessonAssignment {
  id: string;
  lessonId: string;
  /** Plain text as the müderris typed it; null when there is none. */
  description: string | null;
  files: ILessonAssignmentFile[];
  createdAt: Date;
  /** When the müderris last changed it: the description, or a file added or removed. */
  updatedAt: Date;
}

/** tedrisat's download route of a homework file, from the API's root. */
export const lessonAssignmentFileDownloadUrl = (
  lessonId: string,
  fileId: string
): string => `/lessons/${lessonId}/assignment/files/${fileId}`;

/** A homework row and its file rows as the API carries them: the storage keys stay behind. */
export function lessonAssignmentOf(
  row: AssignmentRow,
  files: readonly AssignmentFileRow[]
): ILessonAssignment {
  return {
    id: row.id,
    lessonId: row.lessonId,
    description: row.description,
    files: files.map((file) => ({
      id: file.id,
      name: file.fileName,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      createdAt: file.createdAt,
      downloadUrl: lessonAssignmentFileDownloadUrl(row.lessonId, file.id),
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
