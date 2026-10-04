import { ApiProperty } from "@nestjs/swagger";
import { ARCHIVE_ITEM_TYPES } from "../archive-types";
import { HIDE_LEVELS } from "../hide-level";

export class ArchiverResponse {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Null when the account never signed in to tedrisat.",
  })
  name!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "The role the hider holds or held where the item sits (KOSK_NAZIM, MEDRESE_BASMUDERRIS, MEDRESE_NAZIR, MUDERRIS, DERS_NAZIR); null for SYSTEM_ADMIN or when none is on record. The client words it.",
  })
  role!: string | null;
}

export class ArchiveItemResponse {
  @ApiProperty({ enum: ARCHIVE_ITEM_TYPES, enumName: "ArchiveItemType" })
  type!: string;

  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ description: "The hidden thing's own title or name." })
  title!: string;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  koskId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  koskName!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  madrasahId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  madrasahName!: string | null;

  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description: "The course a week or a session belongs to.",
  })
  courseId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  courseTitle!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: "Of a week, and of the week a session is in.",
  })
  weekNumber!: number | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  scheduledAt!: Date | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: "Of a course: its live weeks.",
  })
  weekCount!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: "Of a week: its live sessions.",
  })
  sessionCount!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: "Of a course: its enrolled talebe.",
  })
  studentCount!: number | null;

  @ApiProperty({ type: String, format: "date-time" })
  archivedAt!: Date;

  @ApiProperty({ type: ArchiverResponse, nullable: true })
  archivedBy!: ArchiverResponse | null;

  @ApiProperty({
    enum: [...HIDE_LEVELS],
    enumName: "HideLevel",
    description:
      "The level the hider acted at (course, madrasah, kosk, platform); a row hidden before it was recorded counts as the lowest level that could have hidden it. Only that level or above brings it back.",
  })
  hiddenLevel!: string;

  @ApiProperty({
    description:
      "Whether the caller may bring it back (Geri al): they hold a code that hides it where it sits and act at the hider's level or above. False when a higher level hid it. A hidden parent still answers 409 on restore.",
  })
  canRestore!: boolean;
}

export class PaginatedArchiveResponse {
  @ApiProperty({ type: [ArchiveItemResponse] })
  items!: ArchiveItemResponse[];

  @ApiProperty({
    description: "All hidden items matching, not just this page.",
  })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}

export class MadrasahArchiveCountsResponse {
  @ApiProperty({ description: "Everything hidden in the medrese (Tümü)." })
  all!: number;

  @ApiProperty()
  course!: number;

  @ApiProperty()
  week!: number;

  @ApiProperty()
  session!: number;

  @ApiProperty({ description: "0 until recordings are stored." })
  recording!: number;
}

/** The medrese itself, for the banner nazir/12 shows when it is hidden. */
export class MadrasahArchiveStateResponse {
  @ApiProperty({ description: "Whether the medrese is hidden." })
  hidden!: boolean;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  hiddenAt!: Date | null;

  @ApiProperty({
    enum: [...HIDE_LEVELS],
    enumName: "HideLevel",
    nullable: true,
    description: "The level that hid it; null while it is shown.",
  })
  hiddenLevel!: string | null;

  @ApiProperty({ type: ArchiverResponse, nullable: true })
  hiddenBy!: ArchiverResponse | null;

  @ApiProperty({
    description:
      "Whether the caller may bring the medrese back (`POST /madrasahs/:id/restore`): it is hidden, they hold `madrasah.hide` or `platform.madrasah_edit` on it and act at the level that hid it or above.",
  })
  canRestore!: boolean;
}

export class PaginatedMadrasahArchiveResponse {
  @ApiProperty({ type: [ArchiveItemResponse] })
  items!: ArchiveItemResponse[];

  @ApiProperty({
    description: "All hidden items matching `types`, not just this page.",
  })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty({
    type: MadrasahArchiveStateResponse,
    description:
      "The medrese itself: the page cannot read a hidden medrese anywhere else it may not open.",
  })
  madrasah!: MadrasahArchiveStateResponse;

  @ApiProperty({
    type: MadrasahArchiveCountsResponse,
    description:
      "The tabs' numbers: everything hidden in the medrese, whatever `types` says.",
  })
  counts!: MadrasahArchiveCountsResponse;
}

export class CourseArchiveCountsResponse {
  @ApiProperty({ description: "Every hidden week and session of the course." })
  all!: number;

  @ApiProperty()
  week!: number;

  @ApiProperty()
  session!: number;
}

export class PaginatedCourseArchiveResponse extends PaginatedArchiveResponse {
  @ApiProperty({
    type: CourseArchiveCountsResponse,
    description:
      "The tabs' numbers: everything hidden in the course, whatever `types` says.",
  })
  counts!: CourseArchiveCountsResponse;
}

export class ArchiveRestoreResponse {
  @ApiProperty({ enum: ARCHIVE_ITEM_TYPES, enumName: "ArchiveItemType" })
  type!: string;

  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  title!: string;
}

export class ArchiveImpactResponse {
  @ApiProperty({ enum: ARCHIVE_ITEM_TYPES, enumName: "ArchiveItemType" })
  type!: string;

  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ description: "Courses that go with it (a köşk's)." })
  courses!: number;

  @ApiProperty({ description: "Weeks, hidden or not." })
  weeks!: number;

  @ApiProperty({ description: "Sessions (lessons), hidden or not." })
  sessions!: number;

  @ApiProperty({ description: "Enrollments, with each talebe's progress." })
  students!: number;

  @ApiProperty({
    description: "Lesson recordings; 0 until recordings are stored.",
  })
  recordings!: number;

  @ApiProperty({ description: "Followers of a köşk." })
  followers!: number;

  @ApiProperty({ description: "Flashcards of a deck." })
  cards!: number;
}

export class ArchiveScopeRefResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class ArchiveScopesResponse {
  @ApiProperty({ type: [ArchiveScopeRefResponse] })
  kosks!: ArchiveScopeRefResponse[];

  @ApiProperty({ type: [ArchiveScopeRefResponse] })
  madrasahs!: ArchiveScopeRefResponse[];
}
