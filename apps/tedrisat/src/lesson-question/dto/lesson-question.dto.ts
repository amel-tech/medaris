import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsString, MaxLength, MinLength } from "class-validator";

/** Longest question or answer, in characters of Markdown source. */
export const LESSON_QUESTION_BODY_MAX = 4000;

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

const BODY_DESCRIPTION =
  "Markdown source, stored as typed and rendered by the client. Raw HTML is never rendered.";

/** `POST /lessons/:id/questions` (MDRS-150). */
export class AskLessonQuestionDto {
  @ApiProperty({
    minLength: 1,
    maxLength: LESSON_QUESTION_BODY_MAX,
    description: BODY_DESCRIPTION,
    example: "Hocam, ikinci bâbdaki istisnâ mef'ûl-ü bih midir?",
  })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(LESSON_QUESTION_BODY_MAX)
  body!: string;
}

/** `PUT /questions/:questionId/answer` (MDRS-150). */
export class AnswerLessonQuestionDto {
  @ApiProperty({
    minLength: 1,
    maxLength: LESSON_QUESTION_BODY_MAX,
    description: BODY_DESCRIPTION,
  })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(LESSON_QUESTION_BODY_MAX)
  body!: string;
}

/** A person named on a question: who asked it, who answered it. */
export class QuestionPersonResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Null when the account carries neither a name nor an e-mail.",
  })
  name!: string | null;
}

/** The answer kept on a question. */
export class QuestionAnswerResponse {
  @ApiProperty({ description: BODY_DESCRIPTION })
  body!: string;

  @ApiProperty({ type: Date })
  answeredAt!: Date;

  @ApiProperty({ type: QuestionPersonResponse })
  answeredBy!: QuestionPersonResponse;
}

/** A question as its author reads it (MDRS-150). */
export class LessonQuestionResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  lessonId!: string;

  @ApiProperty({ description: "Title of the session the question is on." })
  lessonTitle!: string;

  @ApiProperty({ description: "Number of the week the session is in." })
  weekNumber!: number;

  @ApiProperty({ description: BODY_DESCRIPTION })
  body!: string;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiProperty({
    type: QuestionAnswerResponse,
    nullable: true,
    description: "Null while nobody has answered.",
  })
  answer!: QuestionAnswerResponse | null;
}

/** A question as the course staff read it: with whoever asked it. */
export class CourseQuestionResponse extends LessonQuestionResponse {
  @ApiProperty({ type: QuestionPersonResponse })
  author!: QuestionPersonResponse;
}
