import type {
  courseResources,
  lessonResources,
} from "../../database/schema/course.schema";
import type { IStoredFile } from "../../storage/stored-file";
import type {
  ILessonResource,
  IResource,
  IResourceFile,
} from "../course.repository.interface";

type CourseResourceRow = typeof courseResources.$inferSelect;
type LessonResourceRow = typeof lessonResources.$inferSelect;
type FileColumns = Pick<
  CourseResourceRow,
  "storageKey" | "fileName" | "contentType" | "sizeBytes"
>;

/** tedrisat's download route of a course's file (MDRS-287), from the API's root. */
export const courseResourceDownloadUrl = (
  courseId: string,
  resourceId: string
): string => `/courses/${courseId}/resources/${resourceId}/file`;

/** tedrisat's download route of a celse's file (MDRS-287), from the API's root. */
export const lessonResourceDownloadUrl = (
  lessonId: string,
  resourceId: string
): string => `/lessons/${lessonId}/resources/${resourceId}/file`;

/** The stored file of a row, or null for a link: all four columns or none (the table's CHECK). */
export function storedFileOf(row: FileColumns): IStoredFile | null {
  if (
    row.storageKey === null ||
    row.fileName === null ||
    row.contentType === null ||
    row.sizeBytes === null
  ) {
    return null;
  }
  return {
    storageKey: row.storageKey,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
  };
}

const fileView = (
  row: FileColumns,
  downloadUrl: string
): IResourceFile | null => {
  const file = storedFileOf(row);
  return file
    ? {
        name: file.fileName,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        downloadUrl,
      }
    : null;
};

/** A course resource row as the API carries it: the storage key stays behind. */
export function courseResourceOf(row: CourseResourceRow): IResource {
  return {
    id: row.id,
    courseId: row.courseId,
    name: row.name,
    meta: row.meta,
    type: row.type,
    url: row.url,
    file: fileView(row, courseResourceDownloadUrl(row.courseId, row.id)),
    orderIndex: row.orderIndex,
  };
}

/** A celse resource row as the API carries it: the storage key stays behind. */
export function lessonResourceOf(row: LessonResourceRow): ILessonResource {
  return {
    id: row.id,
    lessonId: row.lessonId,
    name: row.name,
    meta: row.meta,
    url: row.url,
    file: fileView(row, lessonResourceDownloadUrl(row.lessonId, row.id)),
    orderIndex: row.orderIndex,
  };
}
