import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  KOSK_STATUSES,
  KoskPersonResponse,
  type KoskStatus,
} from "./kosk-admin.dto";

export class KoskCourseCountsResponse {
  @ApiProperty({ description: "Every course, hidden ones too" })
  all!: number;

  @ApiProperty({ description: "Published and not hidden" })
  published!: number;

  @ApiProperty({ description: "Drafts that are not hidden" })
  draft!: number;

  @ApiProperty({ description: "Hidden, whatever their status was" })
  hidden!: number;
}

export class KoskOverviewMadrasahResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class KoskOverviewResponse {
  @ApiProperty({ enum: KOSK_STATUSES, enumName: "KoskStatus" })
  status!: KoskStatus;

  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description: "Since when it is hidden or passive; null while active",
  })
  since!: Date | null;

  @ApiProperty({ type: Date, description: "When the köşk was opened" })
  openedAt!: Date;

  @ApiPropertyOptional({
    type: KoskPersonResponse,
    nullable: true,
    description: "Who opened it (the köşk's creator)",
  })
  openedBy!: KoskPersonResponse | null;

  @ApiProperty({ type: KoskCourseCountsResponse })
  courses!: KoskCourseCountsResponse;

  @ApiProperty({
    description:
      "Distinct talebe enrolled in the köşk's courses; hidden courses do not count",
  })
  students!: number;

  @ApiProperty({
    description:
      "Applications waiting for a decision in courses that are not hidden",
  })
  pendingApplications!: number;

  @ApiProperty({ description: "Köşk nazımları held now" })
  nazimCount!: number;

  @ApiProperty({
    type: KoskOverviewMadrasahResponse,
    isArray: true,
    description: "The medreses that hold a hosting right here, oldest first",
  })
  hostingMadrasahs!: KoskOverviewMadrasahResponse[];
}

export const KOSK_COURSE_STATUSES = ["PUBLISHED", "DRAFT", "HIDDEN"] as const;
export type KoskCourseStatus = (typeof KOSK_COURSE_STATUSES)[number];

export class KoskCourseMuderrisResponse {
  @ApiProperty()
  name!: string;

  @ApiProperty({ description: "The course's imam" })
  isImam!: boolean;
}

export class KoskCourseRowResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ example: 220 })
  coverHue!: number;

  @ApiProperty({ description: "Weeks the programme still has" })
  weekCount!: number;

  @ApiPropertyOptional({
    type: KoskOverviewMadrasahResponse,
    nullable: true,
    description: "The medrese that opened the course; null for the köşk's own",
  })
  madrasah!: KoskOverviewMadrasahResponse | null;

  @ApiProperty({
    enum: KOSK_COURSE_STATUSES,
    enumName: "KoskCourseStatus",
    description: "HIDDEN wins over PUBLISHED and DRAFT",
  })
  status!: KoskCourseStatus;

  @ApiPropertyOptional({ type: Date, nullable: true })
  hiddenAt!: Date | null;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiProperty({
    type: KoskCourseMuderrisResponse,
    isArray: true,
    description: "In the order the course lists them; the imam is flagged",
  })
  muderris!: KoskCourseMuderrisResponse[];

  @ApiProperty({ description: "Enrolled talebe (applications do not count)" })
  studentCount!: number;

  @ApiProperty({ description: "Applications waiting for a decision" })
  pendingCount!: number;

  @ApiProperty({
    description:
      "Talebe barred from this course or from the whole köşk, counted once each",
  })
  bannedCount!: number;
}

export class KoskCourseRosterResponse {
  @ApiProperty({ type: KoskCourseCountsResponse })
  counts!: KoskCourseCountsResponse;

  @ApiProperty({
    type: KoskCourseRowResponse,
    isArray: true,
    description: "Every course, newest first",
  })
  items!: KoskCourseRowResponse[];
}
