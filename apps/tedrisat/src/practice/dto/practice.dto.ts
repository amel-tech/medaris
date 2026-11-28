import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from "class-validator";
import { AnswerMode } from "../../online-exam/domain/online-exam";
import { MyQuestionNoteResponse } from "../../question-note/dto/question-note.dto";
import {
  PoolMode,
  PracticeAttemptStatus,
  PracticeOutcome,
} from "../domain/practice";

/** A solving of the course's question pool. */
export class StartPracticePoolDto {
  @ApiProperty({
    enum: PoolMode,
    enumName: "PoolMode",
    description:
      "ALL: every question of the course's published çalışma setleri; RANDOM: `count` of them at random, none twice.",
  })
  @IsEnum(PoolMode)
  mode!: PoolMode;

  @ApiPropertyOptional({
    minimum: 1,
    description:
      "RANDOM only, and required there: how many questions, from 1 to the pool's size. Not read under ALL.",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  count?: number;
}

/** One answer, saved the moment it is chosen. */
export class SavePracticeAnswerDto {
  @ApiProperty({
    type: [String],
    format: "uuid",
    description:
      "The options chosen, of this question only; none clears the answer. A radio question (SINGLE) takes one at most.",
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsUUID("all", { each: true })
  optionIds!: string[];
}

/** A çalışma seti as the talebe's list shows it, with where the caller stands on it. */
export class PracticeSetSummaryResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) courseId!: string;
  @ApiProperty({ description: "The course's title." }) courseTitle!: string;
  @ApiProperty() title!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "The team's own words about the set.",
  })
  instructions!: string | null;
  @ApiProperty({
    description:
      "The questions an attempt is given: the set's complete questions.",
  })
  questionCount!: number;
  @ApiProperty({ description: "How many times the caller finished it." })
  attemptCount!: number;
  @ApiProperty({
    type: String,
    nullable: true,
    example: "66.67",
    description:
      "The percentage of the caller's latest finished attempt, with two decimals; null before the first.",
  })
  lastPercent!: string | null;
  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description:
      "The caller's attempt in progress, which starting the set again goes on with; null when none.",
  })
  openAttemptId!: string | null;
  @ApiProperty() publishedAt!: Date;
}

/** One option of a question; `correct` only once the attempt is finished. */
export class PracticeOptionResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() text!: string;
  @ApiPropertyOptional({
    description:
      "Whether it is a correct option: sent only once the attempt is finished, never before.",
  })
  correct?: boolean;
}

/** One question of an attempt, in the attempt's order. */
export class PracticeQuestionResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ description: "1 up, in the attempt's order." })
  number!: number;
  @ApiProperty() text!: string;
  @ApiProperty({
    description:
      "The title of the çalışma seti the question is of: in a pool attempt, where it came from.",
  })
  setTitle!: string;
  @ApiProperty({ enum: AnswerMode, enumName: "AnswerMode" })
  answerMode!: AnswerMode;
  @ApiProperty({
    type: [PracticeOptionResponse],
    description: "In the attempt's order.",
  })
  options!: PracticeOptionResponse[];
  @ApiProperty({
    type: [String],
    format: "uuid",
    description: "The options the caller chose; none when blank.",
  })
  chosenOptionIds!: string[];
  @ApiPropertyOptional({
    enum: PracticeOutcome,
    enumName: "PracticeOutcome",
    description: "How the answer did; only once the attempt is finished.",
  })
  outcome?: PracticeOutcome;
  @ApiPropertyOptional({
    example: "0.50",
    description:
      "The part of the question the answer got, from 0.00 to 1.00 (a part only under IN_SHARES); only once the attempt is finished.",
  })
  part?: string;
  @ApiPropertyOptional({
    description:
      "Whether the caller may write a note on it (MDRS-248, soru notları); a note written before it was turned off is still in `myNote`. Always sent by the server; optional in the contract (MDRS-248, soru notları).",
  })
  talebeNotes?: boolean;
  @ApiPropertyOptional({
    type: MyQuestionNoteResponse,
    nullable: true,
    description:
      "The caller's own note on it; null when they wrote none. Always sent by the server; optional in the contract (MDRS-248, soru notları).",
  })
  myNote?: MyQuestionNoteResponse | null;
}

/** How a finished attempt went: every question weighs the same. */
export class PracticeResultResponse {
  @ApiProperty({ description: "Questions got whole." }) correct!: number;
  @ApiProperty({ description: "Questions answered and not got whole." })
  wrong!: number;
  @ApiProperty({ description: "Questions left without an answer." })
  blank!: number;
  @ApiProperty({ description: "The attempt's questions." }) total!: number;
  @ApiProperty({
    example: "66.67",
    description:
      "The parts got over the number of questions, as a percentage with two decimals, rounded half up once.",
  })
  percent!: string;
}

/** A talebe's attempt at a çalışma seti or at the course's pool, as its page reads it. */
export class PracticeAttemptResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description: "The set solved; null for a pool attempt.",
  })
  setId!: string | null;
  @ApiProperty({
    enum: PoolMode,
    enumName: "PoolMode",
    nullable: true,
    description: "How a pool attempt was drawn; null for a set's attempt.",
  })
  poolMode!: PoolMode | null;
  @ApiProperty({ format: "uuid" }) courseId!: string;
  @ApiProperty({
    description: "The set's title; empty for a pool attempt.",
  })
  title!: string;
  @ApiProperty({
    enum: PracticeAttemptStatus,
    enumName: "PracticeAttemptStatus",
  })
  status!: PracticeAttemptStatus;
  @ApiProperty() startedAt!: Date;
  @ApiProperty({ type: Date, nullable: true }) finishedAt!: Date | null;
  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description: "The question last answered, where the page goes on.",
  })
  currentQuestionId!: string | null;
  @ApiProperty({ type: [PracticeQuestionResponse] })
  questions!: PracticeQuestionResponse[];
  @ApiProperty({
    type: PracticeResultResponse,
    nullable: true,
    description: "Null while the attempt is in progress.",
  })
  result!: PracticeResultResponse | null;
}

export class PracticeAnswerSavedResponse {
  @ApiProperty({ format: "uuid" }) questionId!: string;
  @ApiProperty({ type: [String], format: "uuid" }) optionIds!: string[];
  @ApiProperty() savedAt!: Date;
}

/** One of the caller's attempts at a set, the latest first. */
export class PracticeAttemptSummaryResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({
    enum: PracticeAttemptStatus,
    enumName: "PracticeAttemptStatus",
  })
  status!: PracticeAttemptStatus;
  @ApiProperty() startedAt!: Date;
  @ApiProperty({ type: Date, nullable: true }) finishedAt!: Date | null;
  @ApiProperty({
    type: PracticeResultResponse,
    nullable: true,
    description: "Null while it is in progress.",
  })
  result!: PracticeResultResponse | null;
}

/** One of the caller's pool attempts in a course, the latest first. */
export class PracticePoolAttemptSummaryResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ enum: PoolMode, enumName: "PoolMode" }) mode!: PoolMode;
  @ApiProperty({ description: "The questions it drew." })
  questionCount!: number;
  @ApiProperty({
    enum: PracticeAttemptStatus,
    enumName: "PracticeAttemptStatus",
  })
  status!: PracticeAttemptStatus;
  @ApiProperty() startedAt!: Date;
  @ApiProperty({ type: Date, nullable: true }) finishedAt!: Date | null;
  @ApiProperty({
    type: PracticeResultResponse,
    nullable: true,
    description: "Null while it is in progress.",
  })
  result!: PracticeResultResponse | null;
}

/** The course's question pool as its talebe sees it. */
export class PracticePoolResponse {
  @ApiProperty({ format: "uuid" }) courseId!: string;
  @ApiProperty({
    description:
      "The complete questions of the course's published çalışma setleri: no exam's, no draft's.",
  })
  questionCount!: number;
  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description:
      "The caller's pool attempt in progress, which starting the pool again goes on with; null when none.",
  })
  openAttemptId!: string | null;
  @ApiProperty({
    type: [PracticePoolAttemptSummaryResponse],
    description: "The caller's latest pool attempts, ten at most.",
  })
  attempts!: PracticePoolAttemptSummaryResponse[];
}

/** How one çalışma seti was solved, for its team. */
export class PracticeSetStatsResponse {
  @ApiProperty({ format: "uuid" }) setId!: string;
  @ApiProperty({ description: "How many talebe finished it at least once." })
  talebeCount!: number;
  @ApiProperty({ description: "How many times it was finished." })
  attemptCount!: number;
  @ApiProperty({
    type: String,
    nullable: true,
    example: "72.50",
    description:
      "The average percentage of its finished attempts, with two decimals; null when none.",
  })
  averagePercent!: string | null;
}
