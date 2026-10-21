import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { MAX_UPLOAD_BYTES } from "../../storage/upload";

/** How many files one homework holds (MDRS-290). */
export const MAX_SUBMISSION_FILES = 5;
/** The longest note, in characters. */
export const SUBMISSION_NOTE_MAX = 4000;
/** How many files the course team returns with one review. */
export const MAX_REVIEW_FILES = 5;

export class SaveSubmissionNoteDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "Birinci babın çekimlerini yazdım.",
    description: `The talebe's note on their homework, at most ${SUBMISSION_NOTE_MAX} characters after trimming; null, absent or blank clears it. Stored as typed and never rendered as HTML.`,
  })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim() || null : value
  )
  @IsOptional()
  @IsString()
  @MaxLength(SUBMISSION_NOTE_MAX)
  note?: string | null;
}

/** `PUT /courses/:id/submissions/:submissionId/review`. */
export class SendSubmissionReviewDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "Çekimler doğru; üçüncü sîgada harekeyi düzelttim.",
    description: `The reviewer's note to the talebe, at most ${SUBMISSION_NOTE_MAX} characters after trimming; null, absent or blank leaves none, which needs at least one review file. Stored as typed and never rendered as HTML.`,
  })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim() || null : value
  )
  @IsOptional()
  @IsString()
  @MaxLength(SUBMISSION_NOTE_MAX)
  note?: string | null;
}

export class SubmissionFileResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({
    example: "Ödev 1.pdf",
    description:
      "The sanitised name it was handed in under; its download is saved as this.",
  })
  name!: string;
  @ApiProperty({
    example: "application/pdf",
    description: "The type read from the file's bytes at upload.",
  })
  contentType!: string;
  @ApiProperty({ example: 482133 }) sizeBytes!: number;
  @ApiProperty({ type: Date }) createdAt!: Date;
  @ApiProperty({
    description:
      "tedrisat's download route for the caller, a path from the API's root: `/lessons/:id/submission/files/:fileId` on the talebe's own homework, `/courses/:id/submissions/files/:fileId` in the staff list. It needs the caller's own token.",
  })
  downloadUrl!: string;
}

export class SubmissionReviewerResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "The account's name, else its e-mail; null for an account tedrisat has not seen sign in.",
  })
  name!: string | null;
}

/**
 * The course team's review of a homework: a note and the files returned with
 * it. The talebe reads it once it is sent; the course team also sees the
 * files added before that.
 */
export class SubmissionReviewResponse {
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({
    type: Date,
    nullable: true,
    description:
      "When it was last sent to the talebe; null while it is not sent yet (staff only: the talebe sees no review until then).",
  })
  reviewedAt!: Date | null;
  @ApiProperty({
    type: () => SubmissionReviewerResponse,
    nullable: true,
    description: "Who last sent it; null while it is not sent.",
  })
  reviewer!: SubmissionReviewerResponse | null;
  @ApiProperty({
    type: [SubmissionFileResponse],
    description:
      "Oldest first. `downloadUrl` is `/lessons/:id/submission/review-files/:fileId` for the talebe, `/courses/:id/submissions/review-files/:fileId` for the course team.",
  })
  files!: SubmissionFileResponse[];
}

/** A talebe's homework on a celse (MDRS-290). */
export class LessonSubmissionResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) lessonId!: string;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: Date }) createdAt!: Date;
  @ApiProperty({
    type: Date,
    description:
      "When the talebe last changed it: the note, or a file added or removed.",
  })
  updatedAt!: Date;
  @ApiProperty({
    type: [SubmissionFileResponse],
    description: "Oldest first.",
  })
  files!: SubmissionFileResponse[];
  @ApiProperty({
    type: () => SubmissionReviewResponse,
    nullable: true,
    description:
      "The course team's review. For the talebe: null until it is sent. For the course team: null while there is neither a sent review nor a review file.",
  })
  review!: SubmissionReviewResponse | null;
}

export class OwnSubmissionResponse {
  @ApiProperty({
    type: () => LessonSubmissionResponse,
    nullable: true,
    description: "Null while the talebe has handed nothing in on the session.",
  })
  submission!: LessonSubmissionResponse | null;
  @ApiProperty({ example: MAX_SUBMISSION_FILES }) maxFiles!: number;
  @ApiProperty({ example: MAX_UPLOAD_BYTES }) maxFileBytes!: number;
}

export class SubmissionTalebeResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "The account's name, else its e-mail; null for an account tedrisat has not seen sign in.",
  })
  name!: string | null;
}

/** A homework as the course's staff list it. */
export class CourseSubmissionResponse extends LessonSubmissionResponse {
  @ApiProperty() lessonTitle!: string;
  @ApiProperty() weekNumber!: number;
  @ApiProperty({ type: () => SubmissionTalebeResponse })
  talebe!: SubmissionTalebeResponse;
}

/** Where a session of the course stands on homework, for its staff. */
export class CourseSubmissionSessionResponse {
  @ApiProperty({ format: "uuid" }) lessonId!: string;
  @ApiProperty({
    description:
      "The course team set homework on the session (`PUT /lessons/:id/assignment`).",
  })
  hasAssignment!: boolean;
  @ApiProperty({
    description:
      'How many of the course\'s enrolled talebe (ENROLLED or COMPLETED) handed homework in on the session: a submission with a note or at least one file. The "N" of "N / M teslim", against `talebeCount`.',
  })
  handedInCount!: number;
}

export class CourseSubmissionsResponse {
  @ApiProperty({
    type: [CourseSubmissionResponse],
    description:
      "By programme order (week, then session), the latest change first within a session.",
  })
  items!: CourseSubmissionResponse[];
  @ApiProperty({
    type: [CourseSubmissionSessionResponse],
    description:
      "Every live session of the course (the one `lessonId` names, when it is given), in programme order, with whether it has homework and how many hand-ins it has.",
  })
  sessions!: CourseSubmissionSessionResponse[];
  @ApiProperty({
    description:
      'The course\'s enrolled talebe (ENROLLED or COMPLETED), who may hand homework in: the "M" of "N / M teslim".',
  })
  talebeCount!: number;
}

/** A session the caller handed homework in on. */
export class MySubmissionSummaryResponse {
  @ApiProperty({ format: "uuid" }) lessonId!: string;
  @ApiProperty({
    type: Date,
    description: "When the caller last changed it.",
  })
  updatedAt!: Date;
}

export class MySubmissionsResponse {
  @ApiProperty({
    type: [MySubmissionSummaryResponse],
    description:
      "The course's live sessions the caller handed homework in on: a note or at least one file. A submission emptied since is not one.",
  })
  items!: MySubmissionSummaryResponse[];
}
