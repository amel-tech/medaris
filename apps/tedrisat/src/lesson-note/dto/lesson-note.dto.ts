import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

/** Longest note, in characters of Markdown source. */
export const LESSON_NOTE_BODY_MAX = 4000;

/** Latest position a note can point at: 99:59:59 into the video. */
export const LESSON_NOTE_OFFSET_MAX = 359_999;

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

const BODY_DESCRIPTION =
  "Markdown source, stored as typed and rendered by the client. Raw HTML is never rendered.";

const OFFSET_DESCRIPTION =
  "Player position in whole seconds from the start of the video; null when unknown. The same value points at the same moment on the live stream and in its recording.";

/** `POST /lessons/:id/notes` (MDRS-150). */
export class CreateLessonNoteDto {
  @ApiProperty({
    minLength: 1,
    maxLength: LESSON_NOTE_BODY_MAX,
    description: BODY_DESCRIPTION,
    example: "Fâil merfû'dur — **ref'** alameti damme.",
  })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(LESSON_NOTE_BODY_MAX)
  body!: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: LESSON_NOTE_OFFSET_MAX,
    example: 754,
    description: OFFSET_DESCRIPTION,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(LESSON_NOTE_OFFSET_MAX)
  offsetSeconds?: number | null;
}

/**
 * `PATCH /lessons/:id/notes/:noteId` (MDRS-150). A key left out stays as it
 * is; `offsetSeconds: null` clears the position.
 */
export class UpdateLessonNoteDto {
  @ApiPropertyOptional({
    minLength: 1,
    maxLength: LESSON_NOTE_BODY_MAX,
    description: BODY_DESCRIPTION,
  })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(LESSON_NOTE_BODY_MAX)
  body?: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: LESSON_NOTE_OFFSET_MAX,
    description: OFFSET_DESCRIPTION,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(LESSON_NOTE_OFFSET_MAX)
  offsetSeconds?: number | null;
}

/** One of the caller's own notes (MDRS-150). */
export class LessonNoteResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  lessonId!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: OFFSET_DESCRIPTION,
  })
  offsetSeconds!: number | null;

  @ApiProperty({ description: BODY_DESCRIPTION })
  body!: string;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiProperty({ type: Date })
  updatedAt!: Date;
}
