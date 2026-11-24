import { ApiProperty } from "@nestjs/swagger";
import { EnrollmentStatus } from "../../course/domain/enrollment-status.enum";
import {
  RecordingProvider,
  RecordingStatus,
  RecordingVisibility,
} from "../../course/domain/recording";

/** The two tables of Celseler: what is still to come, and what has been. */
export const KOSK_SESSION_TABS = ["UPCOMING", "PAST"] as const;
export type KoskSessionTab = (typeof KOSK_SESSION_TABS)[number];

/** The states that make someone a köşk's talebe: a seat held, or finished. */
export const KOSK_STUDENT_STATES = [
  EnrollmentStatus.ENROLLED,
  EnrollmentStatus.COMPLETED,
] as const;

/** One live session of one of the köşk's courses. No meeting link: that is the course's own page's. */
export class KoskSessionRowResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ format: "uuid" })
  courseId!: string;

  @ApiProperty()
  courseTitle!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "The medrese the course belongs to; null for a köşk's own",
  })
  madrasahName!: string | null;

  @ApiProperty()
  weekNumber!: number;

  @ApiProperty({ type: String, format: "date-time" })
  scheduledAt!: Date;

  @ApiProperty({ type: Number, nullable: true })
  durationMinutes!: number | null;

  @ApiProperty({ description: "The session was called off; it stays listed" })
  cancelled!: boolean;

  @ApiProperty({ description: "Held in person, by the lesson or its course" })
  inPerson!: boolean;
}

export class KoskSessionListResponse {
  @ApiProperty({ type: () => KoskSessionRowResponse, isArray: true })
  items!: KoskSessionRowResponse[];

  @ApiProperty({ description: "Rows of the tab asked for, on every page" })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty({ description: "Sessions not over yet, cancelled ones too" })
  upcomingCount!: number;

  @ApiProperty({ description: "Sessions that are over, cancelled ones too" })
  pastCount!: number;
}

export class KoskStudentCourseResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: KOSK_STUDENT_STATES })
  status!: string;
}

/** One talebe of the köşk, with every course of the köşk they attend or finished. */
export class KoskStudentResponse {
  @ApiProperty({ format: "uuid" })
  userId!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  firstEnrolledAt!: Date;

  @ApiProperty({ type: () => KoskStudentCourseResponse, isArray: true })
  courses!: KoskStudentCourseResponse[];
}

export class KoskStudentListResponse {
  @ApiProperty({ type: () => KoskStudentResponse, isArray: true })
  items!: KoskStudentResponse[];

  @ApiProperty({ description: "Talebe matching the search, on every page" })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty({
    description: "Applications waiting in the köşk's courses (Başvurular)",
  })
  pendingCount!: number;
}

/** One ders kaydı of one of the köşk's courses. No address: watching is the course's own page's. */
export class KoskRecordingRowResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ format: "uuid" })
  lessonId!: string;

  @ApiProperty({ format: "uuid" })
  courseId!: string;

  @ApiProperty()
  courseTitle!: string;

  @ApiProperty()
  weekNumber!: number;

  @ApiProperty()
  weekTitle!: string;

  @ApiProperty({
    type: String,
    format: "date-time",
    nullable: true,
    description: "When the session it records was held, if it has a time",
  })
  sessionAt!: Date | null;

  @ApiProperty({ type: Number, nullable: true })
  durationMinutes!: number | null;

  @ApiProperty({ enum: RecordingProvider, enumName: "RecordingProvider" })
  provider!: string;

  @ApiProperty({ enum: RecordingStatus, enumName: "RecordingStatus" })
  status!: string;

  @ApiProperty({ enum: RecordingVisibility, enumName: "RecordingVisibility" })
  visibility!: string;
}

export class KoskRecordingListResponse {
  @ApiProperty({ type: () => KoskRecordingRowResponse, isArray: true })
  items!: KoskRecordingRowResponse[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
