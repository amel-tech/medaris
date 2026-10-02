import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CourseLevel } from "../domain/course-level.enum";
import { CourseStatus } from "../domain/course-status.enum";
import { EnrollmentStatus } from "../domain/enrollment-status.enum";
import { LessonType } from "../domain/lesson-type.enum";

export class AgendaStepResponse {
  @ApiProperty({ example: "21:00" }) time!: string;
  @ApiProperty({ example: "Açılış ve geçen haftanın özeti" }) title!: string;
}

const CONTENT_FIELD =
  "Course content: absent unless the caller holds `view_details` on the course (MDRS-103).";

export class LessonResponse {
  @ApiProperty() id!: string;
  @ApiProperty() weekId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: LessonType }) type!: LessonType;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: "Length of the lesson in minutes; null when not set.",
  })
  durationMinutes!: number | null;
  // `kaynak`, `meetingUrl` and `agenda` are course content (MDRS-103): a
  // course response leaves the keys out for a caller without `view_details`.
  @ApiPropertyOptional({ type: String, description: CONTENT_FIELD })
  kaynak?: string | null;
  @ApiPropertyOptional({ type: Date }) scheduledAt!: Date | null;
  @ApiPropertyOptional({ type: String, description: CONTENT_FIELD })
  meetingUrl?: string | null;
  @ApiPropertyOptional({
    type: [AgendaStepResponse],
    description: CONTENT_FIELD,
  })
  agenda?: AgendaStepResponse[] | null;
  @ApiProperty() isPreview!: boolean;
  @ApiProperty() orderIndex!: number;
  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description:
      "When the session was cancelled (MDRS-158); null while it stands. It stays in the programme, marked.",
  })
  cancelledAt!: Date | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      "The session that makes up for a cancelled one; null when there is none.",
  })
  replacementLessonId!: string | null;
  @ApiPropertyOptional({ type: String, description: CONTENT_FIELD })
  cancelReason?: string | null;
}

/** A lesson written through a session-level endpoint (MDRS-95). */
export class LessonMutationResponse extends LessonResponse {
  @ApiProperty({
    description:
      "The course version this write produced; send it with the next PUT " +
      "/courses/:id or PATCH /lessons/:id.",
  })
  courseVersion!: number;
}

export class WeekResponse {
  @ApiProperty() id!: string;
  @ApiProperty() courseId!: string;
  @ApiProperty() weekNumber!: number;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ type: String }) summary!: string | null;
  @ApiProperty() orderIndex!: number;
  @ApiProperty({ type: [LessonResponse] }) lessons!: LessonResponse[];
}

export class MuderrisResponse {
  @ApiProperty() id!: string;
  @ApiProperty() courseId!: string;
  @ApiPropertyOptional({ type: String }) userId!: string | null;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String }) title!: string | null;
  @ApiPropertyOptional({ type: String }) bio!: string | null;
  @ApiProperty() avatarHue!: number;
  @ApiProperty() orderIndex!: number;
}

export class ResourceResponse {
  @ApiProperty() id!: string;
  @ApiProperty() courseId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String }) meta!: string | null;
  @ApiPropertyOptional({ type: String }) type!: string | null;
  @ApiPropertyOptional({ type: String, description: CONTENT_FIELD })
  url?: string | null;
  @ApiProperty() orderIndex!: number;
}

export class EnrollmentResponse {
  @ApiProperty() userId!: string;
  @ApiProperty() courseId!: string;
  // `nullable: true` is load-bearing here, unlike on the sibling fields that
  // omit it: course.service.ts:118 sends `student.name ?? null`, so the wire
  // really does carry JSON null. Until MDRS-58 the committed spec said so —
  // these two properties, on this class and on PendingEnrollmentResponse, were
  // the only four `nullable: true` flags in the whole document — and dropping
  // the flag while regenerating would have narrowed the published contract to
  // "absent or string" for a response that is neither. The rest of this file
  // has the same gap and never claimed otherwise; see the follow-up in
  // docs/migration/mdrs-58-tedrisat-spec-exporter.md.
  @ApiPropertyOptional({ type: String, nullable: true })
  studentName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  studentEmail!: string | null;
  @ApiProperty({ description: "Percent complete, 0-100" }) progress!: number;
  @ApiProperty({ enum: EnrollmentStatus }) status!: EnrollmentStatus;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class EnrollmentBanResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ enum: ["COURSE", "KOSK"], enumName: "BanScope" })
  scope!: "COURSE" | "KOSK";
}

export class RosterEnrollmentResponse extends EnrollmentResponse {
  @ApiProperty({
    type: () => EnrollmentBanResponse,
    nullable: true,
    description:
      "The open ban that bars the talebe from this course (MDRS-177): its id and scope, never its reason. Null when none.",
  })
  ban!: EnrollmentBanResponse | null;
}

export class PendingEnrollmentResponse extends EnrollmentResponse {
  @ApiProperty() courseTitle!: string;
}

class CourseBase {
  @ApiProperty() id!: string;
  @ApiProperty() koskId!: string;
  @ApiProperty() authorId!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ type: String }) subtitle!: string | null;
  @ApiPropertyOptional({ type: String }) description!: string | null;
  @ApiPropertyOptional({ type: String }) category!: string | null;
  @ApiProperty({ enum: CourseLevel }) level!: CourseLevel;
  @ApiPropertyOptional({ type: String }) language!: string | null;
  @ApiProperty() coverHue!: number;
  @ApiProperty() durationWeeks!: number;
  @ApiProperty({ enum: CourseStatus }) status!: CourseStatus;
  @ApiProperty() grantsCertificate!: boolean;
  @ApiProperty() requiresApproval!: boolean;
  @ApiProperty({
    example: "Europe/Istanbul",
    description:
      "IANA time zone the course's sessions are authored in (MDRS-110).",
  })
  timeZone!: string;
  @ApiProperty({
    description:
      "Optimistic-concurrency token. Send it back with PUT /courses/:id and " +
      "PATCH /lessons/:id; a stale value is refused with 409.",
  })
  version!: number;
  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description:
      "When the köşk manager hid the course (MDRS-124); null while it is live. Only the köşk manager and SYSTEM_ADMIN ever see a non-null value.",
  })
  archivedAt!: Date | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "Who hid the course; null while it is live.",
  })
  archivedBy!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class CourseDetailResponse extends CourseBase {
  @ApiProperty({ type: [WeekResponse] }) weeks!: WeekResponse[];
  @ApiProperty({ type: [MuderrisResponse] }) muderris!: MuderrisResponse[];
  @ApiProperty({ type: [ResourceResponse] }) resources!: ResourceResponse[];
  @ApiPropertyOptional({ type: EnrollmentResponse })
  enrollment!: EnrollmentResponse | null;
  @ApiProperty({
    description:
      "True when the caller may not read the course's content and every content field was left out — the client shows the locked state (MDRS-103).",
  })
  contentLocked!: boolean;
}

export class SummaryMuderrisResponse extends MuderrisResponse {
  @ApiProperty({
    description: "The course's imam among its müderrisler (MDRS-133)",
  })
  isImam!: boolean;
}

export class CourseMadrasahResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
}

export class CourseSummaryResponse extends CourseBase {
  @ApiProperty() weekCount!: number;
  @ApiProperty() lessonCount!: number;
  @ApiProperty() resourceCount!: number;
  @ApiProperty({ type: [SummaryMuderrisResponse] })
  muderris!: SummaryMuderrisResponse[];
  @ApiPropertyOptional({ type: EnrollmentResponse })
  enrollment!: EnrollmentResponse | null;
  @ApiPropertyOptional({
    type: CourseMadrasahResponse,
    nullable: true,
    description: "The medrese that opened the course in this köşk (MDRS-159).",
  })
  madrasah!: CourseMadrasahResponse | null;
  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description:
      "The earliest session still ahead that has not been cancelled; null when none is scheduled (MDRS-159). The meeting link is never part of a summary.",
  })
  nextSessionAt!: Date | null;
}

export class MyEnrollmentResponse extends EnrollmentResponse {
  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description:
      "When the course team marked the course completed (MDRS-159); null for any other status.",
  })
  completedAt!: Date | null;
}

export class NextSessionResponse {
  @ApiProperty({ type: Date }) at!: Date;
  @ApiProperty({ description: "Number of the week the session falls in" })
  weekNumber!: number;
}

export class EnrolledCourseResponse extends CourseBase {
  @ApiProperty() koskName!: string;
  @ApiProperty() weekCount!: number;
  @ApiProperty() lessonCount!: number;
  @ApiProperty({ type: [MuderrisResponse] }) muderris!: MuderrisResponse[];
  @ApiPropertyOptional({
    type: NextSessionResponse,
    nullable: true,
    description:
      "The earliest session still ahead that has not been cancelled (MDRS-159); null when none is scheduled.",
  })
  nextSession!: NextSessionResponse | null;
  @ApiProperty({ type: MyEnrollmentResponse })
  enrollment!: MyEnrollmentResponse;
}
