import type { IArchivePage, IRestorableArchiveEntry } from "./archive.service";
import type {
  ArchiveItemResponse,
  PaginatedArchiveResponse,
} from "./dto/archive-response.dto";
import { hiderLevelOf } from "./hide-level";

export const presentItem = (
  i: IRestorableArchiveEntry
): ArchiveItemResponse => ({
  type: i.type,
  id: i.id,
  title: i.title,
  koskId: i.koskId,
  koskName: i.koskName,
  madrasahId: i.madrasahId,
  madrasahName: i.madrasahName,
  courseId: i.courseId,
  courseTitle: i.courseTitle,
  weekNumber: i.weekNumber,
  scheduledAt: i.scheduledAt,
  weekCount: i.weekCount,
  sessionCount: i.sessionCount,
  studentCount: i.studentCount,
  archivedAt: i.archivedAt,
  archivedBy: i.archiver,
  hiddenLevel: hiderLevelOf(i),
  canRestore: i.canRestore,
});

export const presentPage = (
  page: IArchivePage<IRestorableArchiveEntry>
): PaginatedArchiveResponse => ({
  items: page.items.map(presentItem),
  total: page.total,
  page: page.page,
  limit: page.limit,
});
