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
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { AuthorizedRequest } from "../course/interfaces/authorized-request.interface";
import {
  CourseTopicResponse,
  CreateCourseTopicDto,
  CreateOnlineExamDto,
  ExamPointsResponse,
  ExamQuestionWriteResponse,
  ExamVersionResponse,
  ListOnlineExamsQueryDto,
  OnlineExamCreatedResponse,
  OnlineExamDraftResponse,
  OnlineExamSummaryResponse,
  PublishOnlineExamDto,
  SaveExamQuestionDto,
  SetQuestionPointsDto,
  TopicRemovedResponse,
  UpdateCourseTopicDto,
  UpdateOnlineExamDto,
  VersionDto,
} from "./dto/online-exam.dto";
import { OnlineExamNotFoundError } from "./errors/online-exam.errors";
import { OnlineExamRepository } from "./online-exam.repository";
import { OnlineExamService } from "./online-exam.service";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Authorizes an `/online-exams/:examId` route against the exam's course.
 * Guards run before pipes, so a malformed id is answered here as not found.
 */
export const byOnlineExamCourse: AuthzResolve = async (req, moduleRef) => {
  const examId = typeof req.params.examId === "string" ? req.params.examId : "";
  if (!UUID_REGEX.test(examId)) throw new OnlineExamNotFoundError(examId);
  const courseId = await moduleRef
    .get(OnlineExamRepository, { strict: false })
    .findExamCourseId(examId);
  if (!courseId) throw new OnlineExamNotFoundError(examId);
  return { entity: ENTITIES.COURSE, id: courseId };
};

const FORBIDDEN = "No `exam.prepare` on the course.";

/**
 * Preparing online multiple-choice exams (MDRS-299) on nazar: the course's
 * numbered topics, its exams' drafts and their questions. A draft has no
 * celse, so no talebe sees it anywhere until it is published (the owner,
 * 22 Nov 2026). Every route asks `exam.prepare` on the course: a hoca holds
 * it with every course code, a ders nazırı when it is granted.
 */
@ApiTags("online-exams")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class OnlineExamController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly service: OnlineExamService) {}

  @ApiOperation({
    summary: "The course's online exams",
    description:
      'Nazar\'s "Sınavlar": each online exam of the course with its title, its question count and where it stands, the latest changed first. `?kind=PRACTICE` lists the çalışma setleri instead (MDRS-248); left out, the exams only.',
    operationId: "listOnlineExams",
  })
  @ApiOkResponse({ type: [OnlineExamSummaryResponse] })
  @ApiBadRequestResponse({ description: "VALIDATION_ERROR" })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(PERMISSIONS.EXAM_PREPARE, byParam(ENTITIES.COURSE, "id"))
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Get("courses/:id/online-exams")
  listExams(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) courseId: string,
    @Query() query: ListOnlineExamsQueryDto
  ): Promise<OnlineExamSummaryResponse[]> {
    return this.service.listExams(courseId, request.user, query.kind);
  }

  @ApiOperation({
    summary: "Open a new online exam",
    description:
      '"Yeni sınav": a draft of the course with its title, no length and no question. It has no celse until it is published, so no talebe sees it. `kind: PRACTICE` opens a çalışma seti instead (MDRS-248), which never has a celse. Written to `audit_log` as `online_exam.create`.',
    operationId: "createOnlineExam",
  })
  @ApiCreatedResponse({ type: OnlineExamCreatedResponse })
  @ApiBadRequestResponse({ description: "VALIDATION_ERROR" })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(PERMISSIONS.EXAM_PREPARE, byParam(ENTITIES.COURSE, "id"))
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Post("courses/:id/online-exams")
  createExam(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) courseId: string,
    @Body() dto: CreateOnlineExamDto
  ): Promise<OnlineExamCreatedResponse> {
    return this.service.createExam(courseId, dto.title, request.user, dto.kind);
  }

  @ApiOperation({
    summary: "An online exam as its page reads it",
    description:
      "The settings, the zeroth question copied at publication (empty in a draft), the course's topics by number (each saying whether the exam picked it and how many questions carry it), the questions in order with their options, correct marks, answer mode, topics, points and what each still lacks, the total, where it stands, and the version every write names.",
    operationId: "getOnlineExamDraft",
  })
  @ApiOkResponse({ type: OnlineExamDraftResponse })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @ApiNotFoundResponse({ description: "EXAM_NOT_FOUND" })
  @Authz(PERMISSIONS.EXAM_PREPARE, byOnlineExamCourse)
  @Get("online-exams/:examId")
  getDraft(
    @Req() request: AuthorizedRequest,
    @Param("examId", ParseUUIDPipe) examId: string
  ): Promise<OnlineExamDraftResponse> {
    return this.service.getDraft(examId, request.user);
  }

  @ApiOperation({
    summary: "Change an online exam's settings or topics",
    description:
      "Only what is sent changes. `topicIds` replaces the list; unpicking a topic takes it off the questions that carried it. The zeroth question is the medrese's, copied when the exam is published. Written to `audit_log` as `online_exam.update`.",
    operationId: "updateOnlineExam",
  })
  @ApiOkResponse({ type: ExamVersionResponse })
  @ApiBadRequestResponse({ description: "VALIDATION_ERROR, TOPIC_NOT_FOUND" })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @ApiNotFoundResponse({ description: "EXAM_NOT_FOUND" })
  @ApiConflictResponse({
    description:
      "EXAM_STALE, EXAM_LOCKED, EXAM_KIND_MISMATCH (a length on a çalışma seti)",
  })
  @Authz(PERMISSIONS.EXAM_PREPARE, byOnlineExamCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Patch("online-exams/:examId")
  updateExam(
    @Req() request: AuthorizedRequest,
    @Param("examId", ParseUUIDPipe) examId: string,
    @Body() dto: UpdateOnlineExamDto
  ): Promise<ExamVersionResponse> {
    return this.service.updateExam(examId, dto, request.user);
  }

  @ApiOperation({
    summary: "Yayınla: now, or at a day and time, with a latest start",
    description:
      "Plans the exam's celse at its earliest start, as long as the exam and the latest start together, with its exam row (MULTIPLE_CHOICE, out of 100), and links the exam to it, in one transaction. The course's talebe are told and get the calendar invitation, as of any exam celse. An exam with no question, an incomplete question, points that do not total 100 or no zeroth question is 409 EXAM_NOT_READY, listing them all; the draft's `problems` says the same before. A çalışma seti (PRACTICE, MDRS-248) is published otherwise: at once, with no celse, no notification, no window and no zeroth question (the times in the body are not read); it needs one complete question, for which a topic is not needed (else EXAM_NOT_READY with NO_QUESTION), and its incomplete questions are not solved. Written to `audit_log` as `online_exam.publish`.",
    operationId: "publishOnlineExam",
  })
  @ApiOkResponse({ type: OnlineExamDraftResponse })
  @ApiBadRequestResponse({ description: "VALIDATION_ERROR, EXAM_TIME_PASSED" })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @ApiNotFoundResponse({ description: "EXAM_NOT_FOUND" })
  @ApiConflictResponse({
    description: "EXAM_NOT_READY, EXAM_STALE, EXAM_LOCKED (published already)",
  })
  @Authz(PERMISSIONS.EXAM_PREPARE, byOnlineExamCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @HttpCode(HttpStatus.OK)
  @Post("online-exams/:examId/publish")
  publish(
    @Req() request: AuthorizedRequest,
    @Param("examId", ParseUUIDPipe) examId: string,
    @Body() dto: PublishOnlineExamDto
  ): Promise<OnlineExamDraftResponse> {
    return this.service.publish(examId, dto, request.user);
  }

  @ApiOperation({
    summary: "Taslağa al: take a published exam back, until it opens",
    description:
      "Deletes the celse it was published with (the talebe get the calendar CANCEL) and makes it a draft again, with all it had. Once it has opened it is 409 EXAM_LOCKED. Written to `audit_log` as `online_exam.unpublish`, and its celse as `lesson.delete`.",
    operationId: "unpublishOnlineExam",
  })
  @ApiOkResponse({ type: OnlineExamDraftResponse })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @ApiNotFoundResponse({ description: "EXAM_NOT_FOUND" })
  @ApiConflictResponse({
    description:
      "EXAM_NOT_PUBLISHED, EXAM_LOCKED (it has opened; a çalışma seti once a talebe has started it), EXAM_STALE",
  })
  @Authz(PERMISSIONS.EXAM_PREPARE, byOnlineExamCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @HttpCode(HttpStatus.OK)
  @Post("online-exams/:examId/unpublish")
  unpublish(
    @Req() request: AuthorizedRequest,
    @Param("examId", ParseUUIDPipe) examId: string,
    @Body() dto: VersionDto
  ): Promise<OnlineExamDraftResponse> {
    return this.service.unpublish(examId, dto.version, request.user);
  }

  @ApiOperation({
    summary: "Add a question",
    description:
      "An empty question, last; the page shows five empty option fields. Written to `audit_log` as `exam_question.add`.",
    operationId: "addExamQuestion",
  })
  @ApiCreatedResponse({ type: ExamQuestionWriteResponse })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @ApiNotFoundResponse({ description: "EXAM_NOT_FOUND" })
  @ApiConflictResponse({ description: "EXAM_STALE, EXAM_LOCKED" })
  @Authz(PERMISSIONS.EXAM_PREPARE, byOnlineExamCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Post("online-exams/:examId/questions")
  addQuestion(
    @Req() request: AuthorizedRequest,
    @Param("examId", ParseUUIDPipe) examId: string,
    @Body() dto: VersionDto
  ): Promise<ExamQuestionWriteResponse> {
    return this.service.addQuestion(examId, dto.version, request.user);
  }

  @ApiOperation({
    summary: "Save a question as the preparer writes it",
    description:
      "The text, the options with their correct marks, the answer mode and its scoring, and the topics. A question that lacks its text, a second option, a correct one or, in an exam, a topic is kept as incomplete, and the answer says what it lacks; a çalışma seti's question needs no topic (MDRS-248). Check boxes (MULTIPLE) with fewer than two correct options, or a scoring without them, is 400 QUESTION_MODE_INVALID. A topic of the course the exam has not picked yet is picked with it. Written to `audit_log` as `exam_question.save`.",
    operationId: "saveExamQuestion",
  })
  @ApiOkResponse({ type: ExamQuestionWriteResponse })
  @ApiBadRequestResponse({
    description: "VALIDATION_ERROR, QUESTION_MODE_INVALID, TOPIC_NOT_FOUND",
  })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @ApiNotFoundResponse({ description: "EXAM_NOT_FOUND, QUESTION_NOT_FOUND" })
  @ApiConflictResponse({ description: "EXAM_STALE, EXAM_LOCKED" })
  @Authz(PERMISSIONS.EXAM_PREPARE, byOnlineExamCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Put("online-exams/:examId/questions/:questionId")
  saveQuestion(
    @Req() request: AuthorizedRequest,
    @Param("examId", ParseUUIDPipe) examId: string,
    @Param("questionId", ParseUUIDPipe) questionId: string,
    @Body() dto: SaveExamQuestionDto
  ): Promise<ExamQuestionWriteResponse> {
    return this.service.saveQuestion(examId, questionId, dto, request.user);
  }

  @ApiOperation({
    summary: "Remove a question",
    description:
      "With its options and topics; its points, if it had its own, go back to the share. Written to `audit_log` as `exam_question.remove`.",
    operationId: "removeExamQuestion",
  })
  @ApiOkResponse({ type: ExamVersionResponse })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @ApiNotFoundResponse({ description: "EXAM_NOT_FOUND, QUESTION_NOT_FOUND" })
  @ApiConflictResponse({ description: "EXAM_STALE, EXAM_LOCKED" })
  @Authz(PERMISSIONS.EXAM_PREPARE, byOnlineExamCourse)
  @Delete("online-exams/:examId/questions/:questionId")
  removeQuestion(
    @Req() request: AuthorizedRequest,
    @Param("examId", ParseUUIDPipe) examId: string,
    @Param("questionId", ParseUUIDPipe) questionId: string,
    @Query("version", ParseIntPipe) version: number
  ): Promise<ExamVersionResponse> {
    return this.service.removeQuestion(
      examId,
      questionId,
      version,
      request.user
    );
  }

  @ApiOperation({
    summary: "Give a question points of its own, or put it back into the share",
    description:
      "A number with at most two decimals from 0.01 to 100, or null. The points left (100 minus every question's own) are shared equally, kept exact, over the questions with none. Refused (409 POINTS_OVER_TOTAL, with `pointsLeft`) when the total would pass 100 or nothing would be left for the questions that share. Written to `audit_log` as `exam_question.points`.",
    operationId: "setExamQuestionPoints",
  })
  @ApiOkResponse({ type: ExamPointsResponse })
  @ApiBadRequestResponse({ description: "VALIDATION_ERROR" })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @ApiNotFoundResponse({ description: "EXAM_NOT_FOUND, QUESTION_NOT_FOUND" })
  @ApiConflictResponse({
    description:
      "EXAM_STALE, EXAM_LOCKED, POINTS_OVER_TOTAL, EXAM_KIND_MISMATCH (a çalışma seti, whose questions all weigh the same)",
  })
  @Authz(PERMISSIONS.EXAM_PREPARE, byOnlineExamCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Put("online-exams/:examId/questions/:questionId/points")
  setPoints(
    @Req() request: AuthorizedRequest,
    @Param("examId", ParseUUIDPipe) examId: string,
    @Param("questionId", ParseUUIDPipe) questionId: string,
    @Body() dto: SetQuestionPointsDto
  ): Promise<ExamPointsResponse> {
    return this.service.setPoints(examId, questionId, dto, request.user);
  }

  @ApiOperation({
    summary: "The course's exam topics",
    description:
      "Each with its number in the course and its name, by number. The team types a topic's number to pick it.",
    operationId: "listCourseTopics",
  })
  @ApiOkResponse({ type: [CourseTopicResponse] })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(PERMISSIONS.EXAM_PREPARE, byParam(ENTITIES.COURSE, "id"))
  @Get("courses/:id/exam-topics")
  listTopics(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) courseId: string
  ): Promise<CourseTopicResponse[]> {
    return this.service.listTopics(courseId, request.user);
  }

  @ApiOperation({
    summary: "Add a topic to the course's list",
    description:
      "One to three words (otherwise 400 TOPIC_TOO_LONG), unique in the course whatever its case (409 TOPIC_EXISTS). Its number is the one given or the next free one; a number another topic holds is 409 TOPIC_NUMBER_TAKEN. Written to `audit_log` as `exam_topic.create`.",
    operationId: "createCourseTopic",
  })
  @ApiCreatedResponse({ type: CourseTopicResponse })
  @ApiBadRequestResponse({ description: "VALIDATION_ERROR, TOPIC_TOO_LONG" })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @ApiConflictResponse({ description: "TOPIC_EXISTS, TOPIC_NUMBER_TAKEN" })
  @Authz(PERMISSIONS.EXAM_PREPARE, byParam(ENTITIES.COURSE, "id"))
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Post("courses/:id/exam-topics")
  createTopic(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) courseId: string,
    @Body() dto: CreateCourseTopicDto
  ): Promise<CourseTopicResponse> {
    return this.service.createTopic(courseId, dto, request.user);
  }

  @ApiOperation({
    summary: "Rename or renumber a topic, for the whole course",
    description:
      "Every exam and question that carries it reads the new name and number. Written to `audit_log` as `exam_topic.rename`.",
    operationId: "updateCourseTopic",
  })
  @ApiOkResponse({ type: CourseTopicResponse })
  @ApiBadRequestResponse({ description: "VALIDATION_ERROR, TOPIC_TOO_LONG" })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND, TOPIC_NOT_FOUND" })
  @ApiConflictResponse({ description: "TOPIC_EXISTS, TOPIC_NUMBER_TAKEN" })
  @Authz(PERMISSIONS.EXAM_PREPARE, byParam(ENTITIES.COURSE, "id"))
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @HttpCode(HttpStatus.OK)
  @Patch("courses/:id/exam-topics/:topicId")
  updateTopic(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) courseId: string,
    @Param("topicId", ParseUUIDPipe) topicId: string,
    @Body() dto: UpdateCourseTopicDto
  ): Promise<CourseTopicResponse> {
    return this.service.updateTopic(courseId, topicId, dto, request.user);
  }

  @ApiOperation({
    summary: "Delete a topic from the course's list",
    description:
      "A topic that questions carry is 409 TOPIC_IN_USE, whose `context.questions` names each by `examId`, `examTitle` and its `number` in that exam. Otherwise it goes, and the exams that had picked it lose the pick and their version moves on: the answer names each with its new version, so a page holding one of them writes on without EXAM_STALE. Written to `audit_log` as `exam_topic.remove`.",
    operationId: "removeCourseTopic",
  })
  @ApiOkResponse({ type: TopicRemovedResponse })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND, TOPIC_NOT_FOUND" })
  @ApiConflictResponse({ description: "TOPIC_IN_USE" })
  @Authz(PERMISSIONS.EXAM_PREPARE, byParam(ENTITIES.COURSE, "id"))
  @Delete("courses/:id/exam-topics/:topicId")
  removeTopic(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) courseId: string,
    @Param("topicId", ParseUUIDPipe) topicId: string
  ): Promise<TopicRemovedResponse> {
    return this.service.removeTopic(courseId, topicId, request.user);
  }
}
