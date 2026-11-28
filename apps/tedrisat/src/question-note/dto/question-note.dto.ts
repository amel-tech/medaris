import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsString, MaxLength, MinLength } from "class-validator";
import { ExamKind } from "../../online-exam/domain/online-exam";
import { QUESTION_NOTE_BODY_MAX } from "../domain/question-note";

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

/** `PUT /exam-questions/:questionId/my-note`: the caller's note, written whole. */
export class SaveMyQuestionNoteDto {
  @ApiProperty({
    minLength: 1,
    maxLength: QUESTION_NOTE_BODY_MAX,
    description: "Plain text, trimmed.",
  })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(QUESTION_NOTE_BODY_MAX)
  body!: string;

  @ApiProperty({
    description:
      "true sends it to the course's hoca, who reads and may answer it; false keeps it to the caller. On an exam's question, true is 409 NOTES_SHARE_LOCKED until the exam is over for everyone or its results are open.",
  })
  @IsBoolean()
  sharedWithTeacher!: boolean;
}

/** `PUT /question-notes/:noteId/reply`: the hoca's answer, or an empty one to take it back. */
export class ReplyQuestionNoteDto {
  @ApiProperty({
    maxLength: QUESTION_NOTE_BODY_MAX,
    description: "Plain text, trimmed; empty takes the answer back.",
  })
  @Transform(trimmed)
  @IsString()
  @MaxLength(QUESTION_NOTE_BODY_MAX)
  reply!: string;
}

/** `PUT /online-exams/:examId/questions/:questionId/talebe-notes`. */
export class SetTalebeNotesDto {
  @ApiProperty({
    description: "Whether the talebe may write a note on the question.",
  })
  @IsBoolean()
  talebeNotes!: boolean;
}

/** A note as its own talebe reads it (MDRS-248, soru notları). Nothing of the question's answer is in it. */
export class MyQuestionNoteResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ description: "Whether it was sent to the course's hoca." })
  sharedWithTeacher!: boolean;
  @ApiProperty({ type: Date, nullable: true, description: "When it was sent." })
  sharedAt!: Date | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "The hoca's answer.",
  })
  teacherReply!: string | null;
  @ApiProperty({ type: Date, nullable: true })
  repliedAt!: Date | null;
  @ApiProperty({
    description:
      "An answer the caller has not read yet: `GET /courses/:id/my-question-notes` marks every answer of the course read.",
  })
  newReply!: boolean;
  @ApiProperty({ description: "The caller's last write of it." })
  updatedAt!: Date;
}

/** One of the caller's notes in a course, with its question and its set. */
export class MyQuestionNoteListItemResponse extends MyQuestionNoteResponse {
  @ApiProperty({ format: "uuid" }) questionId!: string;
  @ApiProperty() questionText!: string;
  @ApiProperty({ format: "uuid" }) examId!: string;
  @ApiProperty({ enum: ExamKind, enumName: "ExamKind" }) examKind!: ExamKind;
  @ApiProperty({ description: "The çalışma seti's or the exam's title." })
  setTitle!: string;
  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description: "The exam's celse, for its links; null for a çalışma seti.",
  })
  lessonId!: string | null;
  @ApiProperty() createdAt!: Date;
}

export class QuestionNoteTalebeResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
}

/** A note sent to the hoca, as the set's notes page reads it. */
export class ExamQuestionNoteResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) questionId!: string;
  @ApiProperty({ description: "1 for the first, in the preparer's order." })
  questionNumber!: number;
  @ApiProperty() questionText!: string;
  @ApiProperty({ type: QuestionNoteTalebeResponse })
  talebe!: QuestionNoteTalebeResponse;
  @ApiProperty() body!: string;
  @ApiProperty({ description: "When the talebe sent it." }) sharedAt!: Date;
  @ApiProperty({ description: "The talebe's last write of it." })
  updatedAt!: Date;
  @ApiProperty({
    description: "Whether the talebe wrote it again after it was answered.",
  })
  editedAfterReply!: boolean;
  @ApiProperty({ type: String, nullable: true }) teacherReply!: string | null;
  @ApiProperty({ type: Date, nullable: true }) repliedAt!: Date | null;
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  repliedBy!: string | null;
}

/** A question's notes switch after it was turned. */
export class QuestionTalebeNotesResponse {
  @ApiProperty({ format: "uuid" }) questionId!: string;
  @ApiProperty() talebeNotes!: boolean;
}
