import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { MAX_UPLOAD_BYTES } from "../../storage/upload";

/** How many files one homework holds (MDRS-290). */
export const MAX_SUBMISSION_FILES = 5;
/** The longest note, in characters. */
export const SUBMISSION_NOTE_MAX = 4000;

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

export class CourseSubmissionsResponse {
  @ApiProperty({
    type: [CourseSubmissionResponse],
    description:
      "By programme order (week, then session), the latest change first within a session.",
  })
  items!: CourseSubmissionResponse[];
}
