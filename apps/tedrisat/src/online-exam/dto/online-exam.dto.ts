import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import {
  AnswerMode,
  ONLINE_EXAM_INSTRUCTIONS_MAX,
  ONLINE_EXAM_TITLE_MAX,
  OPTION_TEXT_MAX,
  QUESTION_TEXT_MAX,
  Scoring,
  TOPIC_NAME_MAX,
  TOPIC_NUMBER_MAX,
  ZEROTH_OPTION_MAX,
  ZEROTH_QUESTION_MAX,
} from "../domain/online-exam";

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
const trimmedOrNull = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() || null : value;
const trimmedEach = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((v) => (typeof v === "string" ? v.trim() : v))
    : value;

/** The version every write names: the draft's read, or the answer of the write before. */
class VersionedDto {
  @ApiProperty({
    minimum: 1,
    description:
      "The exam's version the page holds; an older one is refused (409 EXAM_STALE).",
  })
  @IsInt()
  @Min(1)
  version!: number;
}

/** "Sınavı hazırla": the exam's settings, its zeroth question and its topics; only what is sent changes. */
export class UpdateOnlineExamDto extends VersionedDto {
  @ApiPropertyOptional({ maxLength: ONLINE_EXAM_TITLE_MAX })
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(ONLINE_EXAM_TITLE_MAX)
  title?: string;

  @ApiPropertyOptional({
    minimum: 1,
    description: '"Süre (dakika)"; no upper bound.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: ONLINE_EXAM_INSTRUCTIONS_MAX,
    description: "The team's own words for the briefing; blank is none.",
  })
  @Transform(trimmedOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(ONLINE_EXAM_INSTRUCTIONS_MAX)
  instructions?: string | null;

  @ApiPropertyOptional({
    maxLength: ZEROTH_QUESTION_MAX,
    description: "The preparer's question about the hadith.",
  })
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(ZEROTH_QUESTION_MAX)
  zerothQuestion?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      "The zeroth question's options in their order; empty fields are not sent. Replaces them all.",
  })
  @Transform(trimmedEach)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(ZEROTH_OPTION_MAX, { each: true })
  zerothOptions?: string[];

  @ApiPropertyOptional({
    type: [String],
    format: "uuid",
    description:
      "The course topics the exam picks, in order. Unpicking one takes it off the questions that carried it.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID("all", { each: true })
  topicIds?: string[];
}

/** "Yeni sınav": a draft of the course, with no celse until it is published. */
export class CreateOnlineExamDto {
  @ApiProperty({ maxLength: ONLINE_EXAM_TITLE_MAX, example: "Ara sınav" })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(ONLINE_EXAM_TITLE_MAX)
  title!: string;
}

/** A new topic of the course's list. */
export class CreateCourseTopicDto {
  @ApiProperty({
    maxLength: TOPIC_NAME_MAX,
    description: "One to three words; unique in the course whatever its case.",
  })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(TOPIC_NAME_MAX)
  name!: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: TOPIC_NUMBER_MAX,
    description: "Its number in the course; left out, the next free one.",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(TOPIC_NUMBER_MAX)
  number?: number;
}

/** A topic renamed or renumbered, for the whole course. */
export class UpdateCourseTopicDto {
  @ApiPropertyOptional({ maxLength: TOPIC_NAME_MAX })
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(TOPIC_NAME_MAX)
  name?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: TOPIC_NUMBER_MAX })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(TOPIC_NUMBER_MAX)
  number?: number;
}

export class VersionDto extends VersionedDto {}

class QuestionOptionDto {
  @ApiProperty({ maxLength: OPTION_TEXT_MAX })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(OPTION_TEXT_MAX)
  text!: string;

  @ApiProperty()
  @IsBoolean()
  correct!: boolean;
}

/** A question as the preparer writes it; an incomplete one is kept, and the answer says what it lacks. */
export class SaveExamQuestionDto extends VersionedDto {
  @ApiProperty({ maxLength: QUESTION_TEXT_MAX })
  @Transform(trimmed)
  @IsString()
  @MaxLength(QUESTION_TEXT_MAX)
  text!: string;

  @ApiProperty({
    type: [QuestionOptionDto],
    description: "The options in order; empty fields are not sent.",
  })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options!: QuestionOptionDto[];

  @ApiProperty({ enum: AnswerMode, enumName: "AnswerMode" })
  @IsEnum(AnswerMode)
  answerMode!: AnswerMode;

  @ApiPropertyOptional({
    enum: Scoring,
    enumName: "Scoring",
    nullable: true,
    description: "Only with MULTIPLE, where it is required.",
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(Scoring)
  scoring?: Scoring | null;

  @ApiProperty({
    type: [String],
    format: "uuid",
    description:
      "Topics of the course; one the exam has not picked yet is picked with the question.",
  })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID("all", { each: true })
  topicIds!: string[];
}

/** A question's own points, or null to put it back into the equal share. */
export class SetQuestionPointsDto extends VersionedDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: "12,5",
    description:
      "A number with at most two decimals, from 0.01 to 100 (a comma or a point); null shares again.",
  })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Matches(/^[0-9]{1,3}([.,][0-9]{1,2})?$/)
  points!: string | null;
}

// ----- answers -----------------------------------------------------------------------------------

export class CourseTopicResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() number!: number;
  @ApiProperty() name!: string;
}

export class DraftCourseTopicResponse extends CourseTopicResponse {
  @ApiProperty({ description: "Whether the exam has picked it." })
  picked!: boolean;
  @ApiProperty({ description: "How many of the exam's questions carry it." })
  questionCount!: number;
}

export class ExamOptionResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() text!: string;
  @ApiProperty() correct!: boolean;
}

export class ZerothOptionResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() text!: string;
}

export class ExamQuestionResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ description: "1 for the first, in the preparer's order." })
  number!: number;
  @ApiProperty() text!: string;
  @ApiProperty({ type: [ExamOptionResponse] }) options!: ExamOptionResponse[];
  @ApiProperty({ enum: AnswerMode, enumName: "AnswerMode" })
  answerMode!: AnswerMode;
  @ApiProperty({ enum: Scoring, enumName: "Scoring", nullable: true })
  scoring!: Scoring | null;
  @ApiProperty({ type: [String], format: "uuid" }) topicIds!: string[];
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Its own points ("12.50"); null when it shares.',
  })
  ownPoints!: string | null;
  @ApiProperty({
    description: 'Its points now, own or share, with two decimals ("1.94").',
  })
  points!: string;
  @ApiProperty() complete!: boolean;
  @ApiProperty({
    type: [String],
    enum: ["text", "option", "correct", "topic"],
    description: "What it still lacks, in the form's order.",
  })
  lacks!: string[];
}

export class OnlineExamDraftResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) courseId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() durationMinutes!: number;
  @ApiProperty({ type: String, nullable: true }) instructions!: string | null;
  @ApiProperty() zerothQuestion!: string;
  @ApiProperty({ type: [ZerothOptionResponse] })
  zerothOptions!: ZerothOptionResponse[];
  @ApiProperty({
    type: [DraftCourseTopicResponse],
    description:
      "The course's topics by number, each saying whether the exam picked it.",
  })
  courseTopics!: DraftCourseTopicResponse[];
  @ApiProperty({
    type: [String],
    format: "uuid",
    description: "The topics the exam picked, in order.",
  })
  topicIds!: string[];
  @ApiProperty({ type: [ExamQuestionResponse] })
  questions!: ExamQuestionResponse[];
  @ApiProperty({
    description: 'The points of every question together ("100.00").',
  })
  pointsTotal!: string;
  @ApiProperty({ enum: ["DRAFT", "SCHEDULED", "OPEN", "CLOSED"] })
  status!: "DRAFT" | "SCHEDULED" | "OPEN" | "CLOSED";
  @ApiProperty() version!: number;
}

export class ExamQuestionWriteResponse {
  @ApiProperty({ type: ExamQuestionResponse }) question!: ExamQuestionResponse;
  @ApiProperty({
    description: "The exam's new version, which the next write names.",
  })
  version!: number;
}

export class ExamVersionResponse {
  @ApiProperty({
    description: "The exam's new version, which the next write names.",
  })
  version!: number;
}

export class QuestionPointsResponse {
  @ApiProperty({ format: "uuid" }) questionId!: string;
  @ApiProperty() points!: string;
  @ApiProperty() own!: boolean;
}

export class ExamPointsResponse {
  @ApiProperty({ type: [QuestionPointsResponse] })
  questions!: QuestionPointsResponse[];
  @ApiProperty() total!: string;
  @ApiProperty({
    description: "The exam's new version, which the next write names.",
  })
  version!: number;
}

export class ExamVersionRefResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({
    description: "The exam's new version, which its next write names.",
  })
  version!: number;
}

export class TopicRemovedResponse {
  @ApiProperty({
    type: [ExamVersionRefResponse],
    description:
      "The exams that had picked the topic, each with the version the removal moved it to; empty when none had.",
  })
  exams!: ExamVersionRefResponse[];
}

export class OnlineExamSummaryResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() questionCount!: number;
  @ApiProperty({ enum: ["DRAFT", "SCHEDULED", "OPEN", "CLOSED"] })
  status!: "DRAFT" | "SCHEDULED" | "OPEN" | "CLOSED";
  @ApiProperty() updatedAt!: Date;
}

export class OnlineExamCreatedResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
}
