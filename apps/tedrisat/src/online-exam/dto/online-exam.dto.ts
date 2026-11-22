import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
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
} from "../domain/online-exam";

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
const trimmedOrNull = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() || null : value;

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

/**
 * "Sınavı hazırla": the exam's settings and its topics; only what is sent
 * changes. Its zeroth question is the medrese's, copied when it is published.
 */
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

/** "Yayınla": now, or at a day and time, with a latest start. */
export class PublishOnlineExamDto extends VersionedDto {
  @ApiPropertyOptional({
    type: Date,
    example: "2026-12-01T17:00:00.000Z",
    description:
      "The earliest start, which becomes the exam celse's time; left out, now. Seconds are dropped. Before this minute is 400 EXAM_TIME_PASSED.",
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date;

  @ApiPropertyOptional({
    type: Date,
    example: "2026-12-01T17:10:00.000Z",
    description:
      "Until when a talebe may start; every attempt gets the whole time. Left out, the earliest start plus 10 minutes. Before the earliest start is 400 EXAM_TIME_PASSED.",
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  latestStartAt?: Date;
}

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

/** One thing that keeps the exam from being published. */
export class PublishProblemResponse {
  @ApiProperty({
    enum: ["NO_QUESTION", "QUESTION", "POINTS", "NO_ZEROTH"],
    description:
      "NO_QUESTION: none yet; QUESTION: question `number` lacks `lacks`; POINTS: they total `total`, not 100; NO_ZEROTH: the madrasah has no zeroth question.",
  })
  kind!: "NO_QUESTION" | "QUESTION" | "POINTS" | "NO_ZEROTH";
  @ApiPropertyOptional() number?: number;
  @ApiPropertyOptional({
    type: [String],
    enum: ["text", "option", "correct", "topic"],
  })
  lacks?: string[];
  @ApiPropertyOptional({ example: "80.00" }) total?: string;
}

export class OnlineExamDraftResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) courseId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() durationMinutes!: number;
  @ApiProperty({ type: String, nullable: true }) instructions!: string | null;
  @ApiProperty({
    description:
      "The medrese's zeroth question as it was copied when the exam was published; empty in a draft.",
  })
  zerothQuestion!: string;
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
  @ApiProperty({
    type: Date,
    nullable: true,
    description:
      "The earliest start, its celse's time; null for a draft, which has no celse.",
  })
  startsAt!: Date | null;
  @ApiProperty({ type: Date, nullable: true })
  latestStartAt!: Date | null;
  @ApiProperty({
    type: [PublishProblemResponse],
    description: "What keeps it from being published; empty when it can be.",
  })
  problems!: PublishProblemResponse[];
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

export class OnlineExamSummaryResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() questionCount!: number;
  @ApiProperty({ enum: ["DRAFT", "SCHEDULED", "OPEN", "CLOSED"] })
  status!: "DRAFT" | "SCHEDULED" | "OPEN" | "CLOSED";
  @ApiProperty({
    type: Date,
    nullable: true,
    description: "When it opens; null for a draft.",
  })
  startsAt!: Date | null;
  @ApiProperty() updatedAt!: Date;
}

export class OnlineExamCreatedResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
}
