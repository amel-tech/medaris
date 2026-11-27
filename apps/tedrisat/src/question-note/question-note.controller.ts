import {
  AuthGuard,
  Authz,
  AuthzGuard,
  type AuthzResolve,
  byParam,
  ENTITIES,
  MedarisValidationPipe,
  PERMISSIONS,
} from "@medaris/common";
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { AuthorizedRequest } from "../course/interfaces/authorized-request.interface";
import { byOnlineExamCourse } from "../online-exam/online-exam.controller";
import {
  ExamQuestionNoteResponse,
  MyQuestionNoteListItemResponse,
  MyQuestionNoteResponse,
  ReplyQuestionNoteDto,
  SaveMyQuestionNoteDto,
} from "./dto/question-note.dto";
import {
  NoteQuestionNotFoundError,
  QuestionNoteNotFoundError,
} from "./errors/question-note.errors";
import { QuestionNoteRepository } from "./question-note.repository";
import { QuestionNoteService } from "./question-note.service";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Authorizes an `/exam-questions/:questionId` route against the course of
 * the question's set or exam. Guards run before pipes, so a malformed id is
 * answered here as not found.
 */
export const byExamQuestionCourse: AuthzResolve = async (req, moduleRef) => {
  const questionId =
    typeof req.params.questionId === "string" ? req.params.questionId : "";
  if (!UUID_REGEX.test(questionId)) {
    throw new NoteQuestionNotFoundError(questionId);
  }
  const courseId = await moduleRef
    .get(QuestionNoteRepository, { strict: false })
    .findQuestionCourse(questionId);
  if (!courseId) throw new NoteQuestionNotFoundError(questionId);
  return { entity: ENTITIES.COURSE, id: courseId };
};

/**
 * Authorizes a `/question-notes/:noteId` route against the note's course.
 * A note its talebe kept to themselves is not found to anyone here.
 */
export const byQuestionNoteCourse: AuthzResolve = async (req, moduleRef) => {
  const noteId = typeof req.params.noteId === "string" ? req.params.noteId : "";
  if (!UUID_REGEX.test(noteId)) throw new QuestionNoteNotFoundError(noteId);
  const courseId = await moduleRef
    .get(QuestionNoteRepository, { strict: false })
    .findSharedCourse(noteId);
  if (!courseId) throw new QuestionNoteNotFoundError(noteId);
  return { entity: ENTITIES.COURSE, id: courseId };
};

const TALEBE_FORBIDDEN =
  "QUESTION_NOTES_FORBIDDEN (not a talebe of the course who may write on it)";
const QUESTION_NOT_FOUND =
  "NOTE_QUESTION_NOT_FOUND (no such question, or one the caller never got in an attempt of their own)";
const HOCA_FORBIDDEN = "No `exam.prepare` on the course.";

/**
 * Soru notları (MDRS-248): a talebe's note on a question of a çalışma seti
 * or an online exam, kept to themselves or sent to the course's hoca, and
 * the hoca's answer. The talebe's routes ask `course.view` on the
 * question's course and the service a talebe's seat; the hoca's ask
 * `exam.prepare` on the set's course. Per-user answers; no shared cache may
 * keep them.
 */
@ApiTags("question-notes")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class QuestionNoteController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly service: QuestionNoteService) {}

  @ApiOperation({
    summary: "Write the caller's note on a question",
    description:
      "A new note, or the caller's note written again whole, on a question they got in an attempt of their own (a çalışma seti's, the pool's or their sitting of an exam). `sharedWithTeacher: true` sends it to the course's hoca, who is notified (QUESTION_NOTE_SHARED); false keeps it to the caller. An answer the hoca gave stays through a new text. A question the team turned notes off for is 409 NOTES_DISABLED. Sending an exam's note before the exam is over for everyone or its results are open is 409 NOTES_SHARE_LOCKED; the note may be kept to the caller meanwhile.",
    operationId: "saveMyQuestionNote",
  })
  @ApiOkResponse({ type: MyQuestionNoteResponse })
  @ApiBadRequestResponse({ description: "VALIDATION_ERROR" })
  @ApiForbiddenResponse({ description: TALEBE_FORBIDDEN })
  @ApiNotFoundResponse({ description: QUESTION_NOT_FOUND })
  @ApiConflictResponse({ description: "NOTES_DISABLED, NOTES_SHARE_LOCKED" })
  @Authz(PERMISSIONS.COURSE_VIEW, byExamQuestionCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Header("Cache-Control", "private, no-store")
  @Put("exam-questions/:questionId/my-note")
  saveMine(
    @Req() request: AuthorizedRequest,
    @Param("questionId", ParseUUIDPipe) questionId: string,
    @Body() dto: SaveMyQuestionNoteDto
  ): Promise<MyQuestionNoteResponse> {
    return this.service.saveMine(request.user, questionId, dto);
  }

  @ApiOperation({
    summary: "Delete the caller's note on a question",
    description:
      "The note goes with the hoca's answer on it, whether or not the team turned notes off since.",
    operationId: "deleteMyQuestionNote",
  })
  @ApiNoContentResponse({ description: "Deleted." })
  @ApiForbiddenResponse({ description: TALEBE_FORBIDDEN })
  @ApiNotFoundResponse({
    description: `${QUESTION_NOT_FOUND}, QUESTION_NOTE_NOT_FOUND (no note of the caller's on it)`,
  })
  @Authz(PERMISSIONS.COURSE_VIEW, byExamQuestionCourse)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete("exam-questions/:questionId/my-note")
  removeMine(
    @Req() request: AuthorizedRequest,
    @Param("questionId", ParseUUIDPipe) questionId: string
  ): Promise<void> {
    return this.service.removeMine(request.user, questionId);
  }

  @ApiOperation({
    summary: "The caller's question notes in the course",
    description:
      "Every note of the caller's on a question of the course's çalışma setleri and exams, the latest written first, each with its question's text and its set's title. Reading them marks the hoca's answers on them read (`newReply`).",
    operationId: "listMyQuestionNotes",
  })
  @ApiOkResponse({ type: [MyQuestionNoteListItemResponse] })
  @ApiForbiddenResponse({ description: TALEBE_FORBIDDEN })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(PERMISSIONS.COURSE_VIEW, byParam(ENTITIES.COURSE, "id"))
  @Header("Cache-Control", "private, no-store")
  @Get("courses/:id/my-question-notes")
  listMine(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) courseId: string
  ): Promise<MyQuestionNoteListItemResponse[]> {
    return this.service.listMine(request.user, courseId);
  }

  @ApiOperation({
    summary: "The notes the talebe sent on a set's or an exam's questions",
    description:
      "Only the notes sent to the hoca: each with its question's number and text, the talebe's name, the note, the answer and the times, the unanswered first (the longest waiting first), then the answered (the latest answered first). A note kept to its talebe is never listed.",
    operationId: "listExamQuestionNotes",
  })
  @ApiOkResponse({ type: [ExamQuestionNoteResponse] })
  @ApiForbiddenResponse({ description: HOCA_FORBIDDEN })
  @ApiNotFoundResponse({ description: "EXAM_NOT_FOUND" })
  @Authz(PERMISSIONS.EXAM_PREPARE, byOnlineExamCourse)
  @Header("Cache-Control", "private, no-store")
  @Get("online-exams/:examId/notes")
  listForExam(
    @Req() request: AuthorizedRequest,
    @Param("examId", ParseUUIDPipe) examId: string
  ): Promise<ExamQuestionNoteResponse[]> {
    return this.service.listForExam(request.user, examId);
  }

  @ApiOperation({
    summary: "Answer a talebe's note",
    description:
      "Sets the hoca's answer on a note sent to them, replacing an earlier one; an empty `reply` takes it back. The first answer tells the talebe (QUESTION_NOTE_REPLIED). Written to `audit_log` as `question_note.reply`.",
    operationId: "replyQuestionNote",
  })
  @ApiOkResponse({ type: ExamQuestionNoteResponse })
  @ApiBadRequestResponse({ description: "VALIDATION_ERROR" })
  @ApiForbiddenResponse({ description: HOCA_FORBIDDEN })
  @ApiNotFoundResponse({
    description:
      "QUESTION_NOTE_NOT_FOUND (no such note, or one its talebe kept to themselves)",
  })
  @Authz(PERMISSIONS.EXAM_PREPARE, byQuestionNoteCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Put("question-notes/:noteId/reply")
  reply(
    @Req() request: AuthorizedRequest,
    @Param("noteId", ParseUUIDPipe) noteId: string,
    @Body() dto: ReplyQuestionNoteDto
  ): Promise<ExamQuestionNoteResponse> {
    return this.service.reply(request.user, noteId, dto.reply);
  }
}
