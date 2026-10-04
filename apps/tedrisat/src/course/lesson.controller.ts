import {
  AuthGuard,
  Authz,
  AuthzExempt,
  AuthzGuard,
  AuthzPublic,
  type AuthzResolve,
  byParam,
  ENTITIES,
  MedarisValidationPipe,
  SCOPES,
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
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  buildLessonIcs,
  CALENDAR_LOCALES,
  CalendarLocale,
  sessionPageUrl,
} from "./calendar/lesson-calendar";
import { CourseRepository } from "./course.repository";
import { CourseService } from "./course.service";
import { LessonMutationResponse } from "./dto/course-response.dto";
import { CreateWeekLessonDto } from "./dto/create-lesson.dto";
import { CancelLessonDto } from "./dto/muderris-list.dto";
import { RecordingResponse } from "./dto/recording-response.dto";
import {
  CreateSessionBatchDto,
  SessionBatchPreviewResponse,
  SessionBatchResponse,
  WeeklyPatternDto,
} from "./dto/session-batch.dto";
import { SessionResponse } from "./dto/session-response.dto";
import { UpdateLessonDto } from "./dto/update-lesson.dto";
import { CalendarNotConfiguredError } from "./errors/calendar-not-configured.error";
import { CourseNotFoundError } from "./errors/course-not-found.error";
import { LessonNotFoundError } from "./errors/lesson-not-found.error";
import {
  AuthorizedRequest,
  PublicRequest,
} from "./interfaces/authorized-request.interface";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Authorizes a `/lessons/:id` route against the lesson's parent course.
 *
 * Guards run before pipes, so `ParseUUIDPipe` has not seen `:id` yet: a
 * malformed id is answered here as not-found rather than reaching Postgres
 * as a uuid cast error (22P02). The lookup includes archived lessons so that
 * a non-editor gets the same 403 whether or not the lesson is still live.
 */
export const byLessonCourse: AuthzResolve = async (req, moduleRef) => {
  const lessonId = typeof req.params.id === "string" ? req.params.id : "";
  if (!UUID_REGEX.test(lessonId)) throw new LessonNotFoundError(lessonId);
  const courseId = await moduleRef
    .get(CourseRepository, { strict: false })
    .findLessonCourseId(lessonId);
  if (!courseId) throw new LessonNotFoundError(lessonId);
  return { entity: ENTITIES.COURSE, id: courseId };
};

/**
 * Authorizes `GET /courses/:courseId/sessions/:sessionId` against the course,
 * answering a missing or malformed id as not-found first (guards run before
 * pipes, and SYSTEM_ADMIN bypasses the resolver, so the existence check stays
 * here — the same reason as `byExistingCourse` on `CourseController`).
 */
const bySessionCourse: AuthzResolve = async (req, moduleRef) => {
  const courseId =
    typeof req.params.courseId === "string" ? req.params.courseId : "";
  if (
    !UUID_REGEX.test(courseId) ||
    (await moduleRef
      .get(CourseRepository, { strict: false })
      .findKoskId(courseId)) === null
  ) {
    throw new CourseNotFoundError(courseId);
  }
  return { entity: ENTITIES.COURSE, id: courseId };
};

/**
 * Session-level syllabus writes (MDRS-95), so that a routine edit — add one
 * session, move it to next week, drop it — no longer has to round-trip the
 * whole course through `PUT /courses/:id`. All three bump the course
 * version, so a whole-course save loaded before them is refused with 409
 * rather than silently undoing them.
 */
@ApiTags("lessons")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class LessonController {
  // Both must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly courseService: CourseService,
    private readonly config: ConfigService
  ) {}

  @ApiOperation({
    summary:
      "One session as an iCalendar (.ics) file, for Apple Calendar, Google Calendar and Outlook",
    description:
      "Authorized like the session page (`GET /courses/:id`). The event links to the Medaris session page, never to the meeting link. `UID` is derived from the lesson id and `SEQUENCE` is the course version, so a re-import after the session moved updates the event instead of duplicating it (MDRS-117).",
    operationId: "getLessonCalendar",
  })
  @ApiQuery({
    name: "locale",
    required: false,
    enum: Object.values(CALENDAR_LOCALES),
    description:
      "Language of the one-line description; `tr` when omitted. Titles are the course's own.",
  })
  @ApiProduces("text/calendar")
  @ApiOkResponse({ schema: { type: "string" } })
  @ApiNotFoundResponse({
    description:
      "No such live lesson, or it belongs to a course the caller may not see (LESSON_NOT_FOUND).",
  })
  @ApiConflictResponse({
    description: "The lesson has no scheduled time (LESSON_NOT_SCHEDULED).",
  })
  @ApiServiceUnavailableResponse({
    description:
      "TEDRIS_WEB_URL is not configured on this server (CALENDAR_NOT_CONFIGURED).",
  })
  @Get("lessons/:id/calendar.ics")
  // No `@Authz` scope on purpose: the rule is the session page's, which is
  // `getDetail`'s, and `getScheduledLesson` applies it. `GET /courses/:id`
  // carries `@Authz(VIEW)` since MDRS-103, but VIEW is on the COURSE PUBLIC
  // row, so it adds nothing `getDetail` does not already decide. The file
  // carries no content field (see below), so there is nothing to filter.
  @AuthzExempt()
  // Per-user authorization decided this answer; no shared cache may keep it.
  @Header("Cache-Control", "private, no-store")
  async calendar(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("locale", new ParseEnumPipe(CALENDAR_LOCALES, { optional: true }))
    locale: CalendarLocale | undefined
  ): Promise<StreamableFile> {
    const webUrl = this.config.get<string | null>("tedrisWeb.url");
    if (!webUrl) throw new CalendarNotConfiguredError();

    const { course, lesson } = await this.courseService.getScheduledLesson(
      id,
      request.user
    );
    // Only the fields the event uses. The lesson row also carries
    // `meetingUrl`, which must never reach a calendar file.
    const ics = buildLessonIcs({
      course: { id: course.id, title: course.title, version: course.version },
      lesson: {
        id: lesson.id,
        title: lesson.title,
        scheduledAt: lesson.scheduledAt,
        durationMinutes: lesson.durationMinutes,
      },
      sessionPageUrl: sessionPageUrl(webUrl, course.id, lesson.id),
      locale: locale ?? CALENDAR_LOCALES.tr,
      now: new Date(),
      cancelled: lesson.cancelledAt != null,
    });

    return new StreamableFile(Buffer.from(ics, "utf8"), {
      type: "text/calendar; charset=utf-8",
      disposition: `attachment; filename="medaris-${lesson.id}.ics"`,
    });
  }

  @ApiOperation({
    summary: "One live session: its status, cancellation, neighbours and link",
    description:
      "Open to callers with no token, like the course page (MDRS-122), and filtered the same way: `meetingUrl`, `agenda`, `kaynak` and `cancelReason` are sent only to a caller holding `view_details` (the enrolled talebe, the müderris, the köşk manager); for everyone else, PENDING included, those keys are absent and `contentLocked` is true. `status` is derived from the clock and the cancellation, never stored: CANCELLED once cancelled, else ENDED after the session's length (60 minutes when it has none), LIVE while it runs, SCHEDULED before. `meetingUrl` is null for a cancelled or finished session. `previous` and `next` are the neighbouring live sessions in programme order, cancelled ones skipped. A content read by anyone who is neither enrolled nor a müderris is recorded in `audit_log`, as on `GET /courses/:id` (MDRS-158).",
    operationId: "getSession",
  })
  @ApiOkResponse({ type: SessionResponse })
  @ApiNotFoundResponse({
    description:
      "No such course or session, the session is not a live one, or the course is a draft, hidden or in an unlisted köşk to this caller (LESSON_NOT_FOUND, COURSE_NOT_FOUND).",
  })
  @Authz(SCOPES.VIEW, bySessionCourse)
  @AuthzPublic()
  // Per-user authorization decided this answer; no shared cache may keep it.
  @Header("Cache-Control", "private, no-store")
  @Get("courses/:courseId/sessions/:sessionId")
  async getSession(
    @Req() request: PublicRequest,
    @Param("courseId", ParseUUIDPipe) courseId: string,
    @Param("sessionId", ParseUUIDPipe) sessionId: string
  ): Promise<SessionResponse> {
    return this.courseService.getSession(
      courseId,
      sessionId,
      request.user ?? null
    );
  }

  @ApiOperation({
    summary: "The course's lesson recordings, newest week first",
    description:
      "Open to callers with no token, like the course page. A caller holding `view_details` sees every recording; everyone else, PENDING and revoked included, only those with `visibility` PUBLIC. A recording whose `status` is PROCESSING is listed with a null `url`. Sorted by week number descending, then by `recordedAt` descending (MDRS-162). A READY BUNNY recording's `url` is a player link signed for this response, built only for a recording the caller may see, and expiring after `BUNNY_STREAM_EMBED_TTL_SECONDS` (6 hours by default); the response is `Cache-Control: private, no-store` (MDRS-119). What this protects: with token authentication on in the Bunny library, only a signed Bunny link plays, and a signed link passed on plays until it expires. A YouTube, Drive or other pasted link plays for anyone who has it; for those the filter decides who is shown the link, not who can open it.",
    operationId: "listCourseRecordings",
  })
  @ApiOkResponse({ type: [RecordingResponse] })
  @ApiNotFoundResponse({
    description:
      "No such course, or it is a draft, hidden or in an unlisted köşk to this caller (COURSE_NOT_FOUND).",
  })
  @Authz(SCOPES.VIEW, byParam(ENTITIES.COURSE))
  @AuthzPublic()
  @Header("Cache-Control", "private, no-store")
  @Get("courses/:id/recordings")
  async listRecordings(
    @Req() request: PublicRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<RecordingResponse[]> {
    return this.courseService.listRecordings(id, request.user ?? null);
  }

  @ApiOperation({
    summary: "Add a lesson to the end of a week",
    operationId: "createLesson",
  })
  @ApiCreatedResponse({ type: LessonMutationResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Post("courses/:courseId/weeks/:weekId/lessons")
  @Authz(SCOPES.EDIT, byParam(ENTITIES.COURSE, "courseId"))
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  async create(
    @Param("courseId", ParseUUIDPipe) courseId: string,
    @Param("weekId", ParseUUIDPipe) weekId: string,
    @Body() dto: CreateWeekLessonDto
  ): Promise<LessonMutationResponse> {
    return this.courseService.createLesson(courseId, weekId, dto);
  }

  @ApiOperation({
    summary: "Preview the sessions a weekly pattern would create",
    description:
      "Expands the pattern exactly as `POST /courses/:courseId/sessions/batch` " +
      "would and writes nothing, so the editor can show the list before it " +
      "is saved (MDRS-109).",
    operationId: "previewSessionBatch",
  })
  @ApiOkResponse({ type: SessionBatchPreviewResponse })
  @ApiBadRequestResponse({
    description:
      "Field validation, or a pattern that cannot be expanded (INVALID_SESSION_PATTERN).",
  })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Post("courses/:courseId/sessions/batch/preview")
  @HttpCode(HttpStatus.OK)
  @Authz(SCOPES.EDIT, byParam(ENTITIES.COURSE, "courseId"))
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  async previewBatch(
    @Param("courseId", ParseUUIDPipe) courseId: string,
    @Body() dto: WeeklyPatternDto
  ): Promise<SessionBatchPreviewResponse> {
    return this.courseService.previewSessionBatch(courseId, dto);
  }

  @ApiOperation({
    summary: "Create live sessions from a weekly pattern",
    description:
      "Expands the pattern in its IANA zone, so each session keeps its local " +
      "start time across daylight-saving changes, and inserts every session " +
      'in one transaction. The week holding `startDate` is "Hafta 1"; each ' +
      "session goes into the week of its date, and a missing week is created " +
      'as "Hafta N". Bumps the course version like the other session-level ' +
      "writes (MDRS-109).",
    operationId: "createSessionBatch",
  })
  @ApiCreatedResponse({ type: SessionBatchResponse })
  @ApiBadRequestResponse({
    description:
      "Field validation, or a pattern that cannot be expanded (INVALID_SESSION_PATTERN).",
  })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Post("courses/:courseId/sessions/batch")
  @Authz(SCOPES.EDIT, byParam(ENTITIES.COURSE, "courseId"))
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  async createBatch(
    @Param("courseId", ParseUUIDPipe) courseId: string,
    @Body() dto: CreateSessionBatchDto
  ): Promise<SessionBatchResponse> {
    return this.courseService.createSessionBatch(courseId, dto);
  }

  @ApiOperation({
    summary: "Update a lesson; a new weekId moves it and keeps its id",
    operationId: "updateLesson",
  })
  @ApiOkResponse({ type: LessonMutationResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description:
      "The course changed since `version` was loaded (COURSE_VERSION_CONFLICT).",
  })
  @Patch("lessons/:id")
  @Authz(SCOPES.EDIT, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  async update(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateLessonDto
  ): Promise<LessonMutationResponse> {
    const { version, ...changes } = dto;
    return this.courseService.updateLesson(
      id,
      version,
      changes,
      request.user.sub
    );
  }

  @ApiOperation({
    summary: "Cancel a live session; it keeps its slot, marked cancelled",
    description:
      "The session stays in the programme as 'İptal edildi' (MDRS-158); its meeting link is no longer shown. The reason is course content. Written to `audit_log` (MDRS-176).",
    operationId: "cancelLesson",
  })
  @ApiOkResponse({ type: LessonMutationResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description:
      "The course changed since `version` was loaded (COURSE_VERSION_CONFLICT), or the session is cancelled already (LESSON_ALREADY_CANCELLED).",
  })
  @Post("lessons/:id/cancel")
  @HttpCode(HttpStatus.OK)
  @Authz(SCOPES.EDIT, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  async cancel(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CancelLessonDto
  ): Promise<LessonMutationResponse> {
    return this.courseService.cancelLesson(
      id,
      dto.version,
      dto.reason?.trim() || null,
      request.user.sub
    );
  }

  @ApiOperation({
    summary: "Remove a lesson from the course; it is archived, never deleted",
    operationId: "archiveLesson",
  })
  @ApiOkResponse({ type: LessonMutationResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Delete("lessons/:id")
  @Authz(SCOPES.EDIT, byLessonCourse)
  async archive(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<LessonMutationResponse> {
    return this.courseService.archiveLesson(id, request.user.sub);
  }
}
