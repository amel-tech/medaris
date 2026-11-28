import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";

/** The longest note a session may hold, in characters. */
export const TEACHER_NOTE_MAX = 20_000;

/** Trimmed at its end only: leading indentation is Markdown. Empty is null. */
const emptyAsNull = ({ value }: { value: unknown }) => {
  if (typeof value !== "string") return value;
  return value.trim() === "" ? null : value.trimEnd();
};

const BODY =
  "The note as Markdown. It is stored as typed; the reader renders it and never trusts it as HTML.";

export class SaveLessonTeacherNoteDto {
  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: TEACHER_NOTE_MAX,
    description: `${BODY} Null or empty removes the note.`,
  })
  @Transform(emptyAsNull)
  @IsOptional()
  @IsString()
  @MaxLength(TEACHER_NOTE_MAX)
  body?: string | null;
}

export class LessonTeacherNoteResponse {
  @ApiProperty({ format: "uuid" })
  lessonId!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: `${BODY} Null when the session has no note.`,
  })
  body!: string | null;

  @ApiProperty({ type: Date, nullable: true })
  updatedAt!: Date | null;
}
