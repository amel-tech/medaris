import { ApiProperty } from "@nestjs/swagger";
import { ARCHIVE_ITEM_TYPES } from "../archive-types";

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

/** One row of nazir/12's table. */
export class MadrasahArchiveItemResponse extends ArchiveItemResponse {
  @ApiProperty({
    description:
      "Whether the caller may bring it back (Geri al). False when the hider's kademe is above theirs; the hider's role is in `archivedBy.role`. A hidden parent still answers 409 on restore.",
  })
  canRestore!: boolean;
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

export class PaginatedMadrasahArchiveResponse {
  @ApiProperty({ type: [MadrasahArchiveItemResponse] })
  items!: MadrasahArchiveItemResponse[];

  @ApiProperty({
    description: "All hidden items matching `types`, not just this page.",
  })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty({
    type: MadrasahArchiveCountsResponse,
    description:
      "The tabs' numbers: everything hidden in the medrese, whatever `types` says.",
  })
  counts!: MadrasahArchiveCountsResponse;
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
