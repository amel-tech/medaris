import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { EvaluationStatus } from "../../course/domain/assignment-kind.enum";
import {
  EXAM_DEFAULT_MAX_SCORE,
  EXAM_LOCATION_MAX,
  EXAM_MAX_SCORE_LIMIT,
  EXAM_TOPICS_MAX,
  ExamFormat,
} from "../../course/domain/exam";

const trimmedOrNull = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() || null : value;

/**
 * "Sınav" on "Celse planla" (MDRS-248): what makes the one celse planned an
 * exam. Every field has a default, so `{}` is a written exam out of 100.
 */
export class SessionExamDto {
  @ApiPropertyOptional({
    enum: ExamFormat,
    enumName: "ExamFormat",
    default: ExamFormat.WRITTEN,
    description: '"Yazılı" (WRITTEN, the default) or "Şifahi" (ORAL).',
  })
  @IsOptional()
  @IsEnum(ExamFormat)
  format?: ExamFormat;

  @ApiPropertyOptional({
    example: EXAM_DEFAULT_MAX_SCORE,
    minimum: 1,
    maximum: EXAM_MAX_SCORE_LIMIT,
    default: EXAM_DEFAULT_MAX_SCORE,
    description: '"Tam puan": the highest score a talebe can be given.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(EXAM_MAX_SCORE_LIMIT)
  maxScore?: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "Emsile, birinci ve ikinci bab",
    description: `"Konular", plain text, at most ${EXAM_TOPICS_MAX} characters after trimming; blank is none.`,
  })
  @Transform(trimmedOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(EXAM_TOPICS_MAX)
  topics?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "Medrese, 2. sınıf",
    description: `Where it is held in person, at most ${EXAM_LOCATION_MAX} characters; the celse is then marked in person. Null or blank: held online, at the celse's meeting link.`,
  })
  @Transform(trimmedOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(EXAM_LOCATION_MAX)
  location?: string | null;

  @ApiPropertyOptional({
    default: false,
    description:
      '"Telafi": a make-up of an earlier exam of the course; its results are a column of their own.',
  })
  @IsOptional()
  @IsBoolean()
  isRetake?: boolean;
}

/** What makes a celse an exam, on the course detail and the session page. */
export class LessonExamResponse {
  @ApiProperty({ enum: ExamFormat, enumName: "ExamFormat" })
  format!: ExamFormat;
  @ApiProperty({ example: 100 }) maxScore!: number;
  @ApiProperty({ type: String, nullable: true }) topics!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "Where it is held in person; null when online.",
  })
  location!: string | null;
  @ApiProperty({ description: '"Telafi"' }) isRetake!: boolean;
  @ApiProperty({
    type: Date,
    nullable: true,
    description:
      "When the results were opened to the talebe; null while they are closed.",
  })
  resultsReleasedAt!: Date | null;
}

export class SaveExamResultDto {
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 85,
    description:
      "A whole number from 0 to the exam's `maxScore`; null with `absent`. A score above it is 400 EXAM_SCORE_OUT_OF_RANGE.",
  })
  @IsOptional()
  @IsInt()
  score?: number | null;

  @ApiPropertyOptional({
    default: false,
    description: '"Girmedi": the talebe did not sit it; no score is kept.',
  })
  @IsOptional()
  @IsBoolean()
  absent?: boolean;
}

/** One talebe's result on one exam column. */
export class ExamResultResponse {
  @ApiProperty({ format: "uuid", description: "The exam's session." })
  lessonId!: string;
  @ApiProperty({ format: "uuid" }) userId!: string;
  @ApiProperty({ type: Number, nullable: true }) score!: number | null;
  @ApiProperty() absent!: boolean;
  @ApiProperty({ type: Date }) updatedAt!: Date;
}

export class ExamReleaseResponse {
  @ApiProperty({ format: "uuid" }) lessonId!: string;
  @ApiProperty({ type: Date }) resultsReleasedAt!: Date;
}

/** One exam on "Notlarım": the score only once the results are open. */
export class OwnExamGradeResponse {
  @ApiProperty({ format: "uuid" }) lessonId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() weekNumber!: number;
  @ApiProperty({ type: Date, nullable: true }) scheduledAt!: Date | null;
  @ApiProperty() maxScore!: number;
  @ApiProperty() isRetake!: boolean;
  @ApiProperty({
    description:
      "Whether the course team opened the results; `score` and `absent` are null until then, whatever was entered.",
  })
  released!: boolean;
  @ApiProperty({ type: Number, nullable: true }) score!: number | null;
  @ApiProperty({
    type: Boolean,
    nullable: true,
    description: '"Girmedi"; null while closed or not entered.',
  })
  absent!: boolean | null;
}

/** One memorisation homework on "Notlarım", with the caller's mark. */
export class OwnMemorizationGradeResponse {
  @ApiProperty({ format: "uuid" }) lessonId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() weekNumber!: number;
  @ApiProperty({ type: Date, nullable: true }) scheduledAt!: Date | null;
  @ApiProperty({
    enum: EvaluationStatus,
    enumName: "EvaluationStatus",
    nullable: true,
    description: 'null is "Bekliyor".',
  })
  status!: EvaluationStatus | null;
}

/** "Notlarım": the caller's own exam results and memorisation marks. */
export class MyGradesResponse {
  @ApiProperty({
    type: [OwnExamGradeResponse],
    description: "In programme order.",
  })
  exams!: OwnExamGradeResponse[];
  @ApiProperty({
    type: [OwnMemorizationGradeResponse],
    description: "In programme order.",
  })
  memorizations!: OwnMemorizationGradeResponse[];
}

/** One course's exams on the medrese's "Dersler", for its nazır. */
export class MadrasahExamSummaryResponse {
  @ApiProperty({ format: "uuid" }) courseId!: string;
  @ApiProperty() courseTitle!: string;
  @ApiProperty({ description: "Exam celses held in the course." })
  examCount!: number;
  @ApiProperty({
    description:
      'Results entered with a score (not "Girmedi"), over its exams.',
  })
  takenCount!: number;
  @ApiProperty({
    description: 'Results entered as "Girmedi", over its exams.',
  })
  absentCount!: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      "The mean score as a percentage of each exam's `maxScore`, one decimal; null when nothing was entered.",
  })
  averagePercent!: number | null;
}
