import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { MyQuestionNoteResponse } from "../../question-note/dto/question-note.dto";
import {
  AttemptStatus,
  ExamWindow,
  FinishedBy,
  HOLDER_ID_MAX,
  HOLDER_ID_MIN,
} from "../domain/exam-attempt";
import { AnswerMode } from "../domain/online-exam";

/** The page that holds the attempt: an id it draws for itself, kept per tab. */
export class ExamHolderDto {
  @ApiProperty({
    minLength: HOLDER_ID_MIN,
    maxLength: HOLDER_ID_MAX,
    description:
      "An id the page draws for itself, so that a second tab or device can take the attempt over.",
  })
  @IsString()
  @MinLength(HOLDER_ID_MIN)
  @MaxLength(HOLDER_ID_MAX)
  holderId!: string;
}

export class ZerothAnswerDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  optionId!: string;
}

/** One answer, saved the moment it is chosen. */
export class SaveExamAnswerDto extends ExamHolderDto {
  @ApiProperty({
    minimum: 1,
    description:
      "The page's count of its saves, one up on each; a save at or under the one stored writes nothing.",
  })
  @IsInt()
  @Min(1)
  seq!: number;

  @ApiProperty({
    type: [String],
    format: "uuid",
    description:
      "The options chosen; none when the question is skipped or cleared.",
  })
  @IsArray()
  @ArrayUnique()
  @IsUUID("all", { each: true })
  optionIds!: string[];

  @ApiProperty({ description: '"Soruyu atla": it comes back after the last.' })
  @IsBoolean()
  skipped!: boolean;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "The question the talebe is on now, where a resumed attempt goes on.",
  })
  @IsOptional()
  @IsUUID()
  currentQuestionId?: string;
}

export class BriefingZerothOptionResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() text!: string;
}

export class BriefingZerothResponse {
  @ApiProperty({
    description: "The question about the hadith; empty when the exam has none.",
  })
  question!: string;
  @ApiProperty({ type: [BriefingZerothOptionResponse] })
  options!: BriefingZerothOptionResponse[];
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  answeredOptionId!: string | null;
}

export class BriefingAttemptResponse {
  @ApiProperty({ enum: AttemptStatus, enumName: "AttemptStatus" })
  status!: AttemptStatus;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  finishedAt!: Date | null;
  @ApiProperty({ enum: FinishedBy, enumName: "FinishedBy", nullable: true })
  finishedBy!: FinishedBy | null;
}

/** "Bilmeniz gerekenler": what the talebe reads before the exam; no question is sent. */
export class ExamBriefingResponse {
  @ApiProperty({ format: "uuid" }) lessonId!: string;
  @ApiProperty({ format: "uuid" }) courseId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() courseTitle!: string;
  @ApiProperty() durationMinutes!: number;
  @ApiProperty() questionCount!: number;
  @ApiProperty({ type: String, format: "date-time" }) startsAt!: Date;
  @ApiProperty({ type: String, format: "date-time" }) latestStartAt!: Date;
  @ApiProperty({ type: String, nullable: true }) instructions!: string | null;
  @ApiProperty({ enum: ExamWindow, enumName: "ExamWindow" })
  window!: ExamWindow;
  @ApiProperty({ type: BriefingZerothResponse })
  zeroth!: BriefingZerothResponse;
  @ApiProperty({ type: BriefingAttemptResponse, nullable: true })
  attempt!: BriefingAttemptResponse | null;
}

export class AttemptOptionResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() text!: string;
}

/** A question as the talebe gets it: never which options are correct. */
export class AttemptQuestionResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ description: "1 for the first, in this talebe's order." })
  number!: number;
  @ApiProperty() text!: string;
  @ApiProperty({ enum: AnswerMode, enumName: "AnswerMode" })
  answerMode!: AnswerMode;
  @ApiProperty({ description: 'Its points, with two decimals ("33.33").' })
  points!: string;
  @ApiProperty({
    type: [AttemptOptionResponse],
    description: "In this talebe's order.",
  })
  options!: AttemptOptionResponse[];
  @ApiPropertyOptional({
    description:
      "Whether the caller may write a note on it (MDRS-248, soru notları); a note written before it was turned off is still in `myNote`. A note is kept to the caller during the exam: sending it to the hoca waits until the exam is over for everyone (409 NOTES_SHARE_LOCKED). Always sent by the server; optional in the contract (MDRS-248, soru notları).",
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

export class AttemptAnswerResponse {
  @ApiProperty({ format: "uuid" }) questionId!: string;
  @ApiProperty({ type: [String], format: "uuid" }) optionIds!: string[];
  @ApiProperty() skipped!: boolean;
}

/** The caller's attempt: everything the page needs to run it, or how it ended. */
export class ExamAttemptResponse {
  @ApiProperty({ enum: AttemptStatus, enumName: "AttemptStatus" })
  status!: AttemptStatus;
  @ApiProperty({ description: "What is left of the exam's length." })
  secondsLeft!: number;
  @ApiProperty({ description: "How many times the talebe switched away." })
  switches!: number;
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  currentQuestionId!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) startedAt!: Date;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  finishedAt!: Date | null;
  @ApiProperty({ enum: FinishedBy, enumName: "FinishedBy", nullable: true })
  finishedBy!: FinishedBy | null;
  @ApiProperty({
    type: [AttemptQuestionResponse],
    description: "Empty once it is finished.",
  })
  questions!: AttemptQuestionResponse[];
  @ApiProperty({
    type: [AttemptAnswerResponse],
    description: "Every answer saved; empty once it is finished.",
  })
  answers!: AttemptAnswerResponse[];
}

export class ExamClockResponse {
  @ApiProperty() secondsLeft!: number;
  @ApiProperty({ enum: AttemptStatus, enumName: "AttemptStatus" })
  status!: AttemptStatus;
}

export class ExamAnswerSavedResponse {
  @ApiProperty({ format: "uuid" }) questionId!: string;
  @ApiProperty({ type: [String], format: "uuid" }) optionIds!: string[];
  @ApiProperty() skipped!: boolean;
  @ApiProperty({
    description:
      "False when the save's seq was not above the stored one: nothing was written, and this is what the server holds.",
  })
  written!: boolean;
  @ApiProperty() secondsLeft!: number;
}

export class ZerothAnswerResponse {
  @ApiProperty({ format: "uuid" }) optionId!: string;
}
