import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { EvaluationStatus } from "../../course/domain/assignment-kind.enum";

/** The longest note on a mark, in characters: a short line, not a review. */
export const EVALUATION_NOTE_MAX = 280;

/**
 * What a column of "Değerlendirme" is. Only MEMORIZE today: a homework
 * recited to the müderris. Exams join as their own kind, so a reader must
 * skip a kind it does not know rather than fail.
 */
export enum EvaluationColumnKind {
  MEMORIZE = "MEMORIZE",
}

export class SaveEvaluationDto {
  @ApiProperty({
    enum: EvaluationStatus,
    enumName: "EvaluationStatus",
    example: EvaluationStatus.FULL,
    description: '"Tam" (FULL), "Eksik" (INCOMPLETE) or "Vermedi" (ABSENT).',
  })
  @IsEnum(EvaluationStatus)
  status!: EvaluationStatus;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "Son iki satır eksik.",
    description: `An optional short note, at most ${EVALUATION_NOTE_MAX} characters after trimming; null, absent or blank is none. The talebe reads it with the mark. Stored as typed and never rendered as HTML.`,
  })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim() || null : value
  )
  @IsOptional()
  @IsString()
  @MaxLength(EVALUATION_NOTE_MAX)
  note?: string | null;
}

/** One talebe's mark on one column. */
export class EvaluationMarkResponse {
  @ApiProperty({ format: "uuid", description: "The column's session." })
  lessonId!: string;
  @ApiProperty({ format: "uuid", description: "The talebe marked." })
  userId!: string;
  @ApiProperty({ enum: EvaluationStatus, enumName: "EvaluationStatus" })
  status!: EvaluationStatus;
  @ApiProperty({ type: String, nullable: true })
  note!: string | null;
  @ApiProperty({ type: Date, description: "When it was last changed." })
  updatedAt!: Date;
}

/** A column of "Değerlendirme": today a memorisation homework on a session. */
export class EvaluationColumnResponse {
  @ApiProperty({
    enum: EvaluationColumnKind,
    enumName: "EvaluationColumnKind",
    description: "What the column is; skip a kind you do not know.",
  })
  kind!: EvaluationColumnKind;
  @ApiProperty({ format: "uuid", description: "The session it was set on." })
  lessonId!: string;
  @ApiProperty({ example: "Emsile, birinci bab" })
  title!: string;
  @ApiProperty({ example: 1 })
  weekNumber!: number;
  @ApiProperty({
    type: Date,
    nullable: true,
    description: "When the session is held; null when it has no time.",
  })
  scheduledAt!: Date | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "The homework's description, plain text; null when none.",
  })
  description!: string | null;
  @ApiProperty({
    example: 18,
    description: 'Seated talebe marked FULL: "18/30 tam".',
  })
  fullCount!: number;
}

/** A row of "Değerlendirme": a talebe seated in the course. */
export class EvaluationTalebeResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "Their name, else their e-mail; null for an account tedrisat has not seen sign in.",
  })
  name!: string | null;
}

/**
 * "Değerlendirme" of a course: its talebe as rows, the things they are marked
 * on as columns, and the marks given. A cell with no mark is "Bekliyor".
 */
export class EvaluationBoardResponse {
  @ApiProperty({
    type: [EvaluationColumnResponse],
    description: "In programme order.",
  })
  columns!: EvaluationColumnResponse[];
  @ApiProperty({
    type: [EvaluationTalebeResponse],
    description:
      "Every talebe seated in the course (ENROLLED or COMPLETED), by name.",
  })
  talebe!: EvaluationTalebeResponse[];
  @ApiProperty({
    type: [EvaluationMarkResponse],
    description: "The marks given to the talebe above; none is Bekliyor.",
  })
  marks!: EvaluationMarkResponse[];
}

/** The caller's own mark on a session's memorisation homework. */
export class OwnEvaluationResponse {
  @ApiProperty({
    enum: EvaluationStatus,
    enumName: "EvaluationStatus",
    nullable: true,
    description: 'null while the course team has not marked it: "Bekliyor".',
  })
  status!: EvaluationStatus | null;
  @ApiProperty({ type: String, nullable: true })
  note!: string | null;
  @ApiProperty({ type: Date, nullable: true })
  updatedAt!: Date | null;
}
