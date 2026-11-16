import {
  AuthGuard,
  Authz,
  AuthzGuard,
  MedarisValidationPipe,
  PERMISSIONS,
} from "@medaris/common";
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { byExistingCourse } from "../course/course.controller";
import type { AuthorizedRequest } from "../course/interfaces/authorized-request.interface";
import { byLessonCourse } from "../course/lesson.controller";
import { byExistingMadrasah } from "../madrasah/madrasah.controller";
import {
  ExamReleaseResponse,
  ExamResultResponse,
  MadrasahExamSummaryResponse,
  MyGradesResponse,
  SaveExamResultDto,
} from "./dto/exam.dto";
import { ExamService } from "./exam.service";

/**
 * "Ara sınav" (MDRS-248): a celse planned as "Sınav" on "Celse planla"
 * (`POST /courses/:id/sessions/batch` with `exam`), its results entered and
 * opened on nazar's "Değerlendirme", read by the talebe on tedris'
 * "Notlarım" and summed up for the medrese.
 */
@ApiTags("exams")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class ExamController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly service: ExamService) {}

  @ApiOperation({
    summary: "Enter a talebe's result on an exam",
    description:
      '`session.manage` on the course, on a live exam celse (otherwise 404 EXAM_NOT_FOUND), for a talebe seated in its course (otherwise 404 EXAM_TALEBE_NOT_FOUND). A whole score from 0 to the exam\'s `maxScore`, or `absent` ("Girmedi") with none; a score above `maxScore`, below 0 or missing is 400 EXAM_SCORE_OUT_OF_RANGE. Replaces an earlier result; written to `audit_log` as `exam_result.save`. A save that changes nothing writes nothing. The talebe reads it only once the results are opened.',
    operationId: "saveExamResult",
  })
  @ApiOkResponse({ type: ExamResultResponse })
  @ApiBadRequestResponse({
    description: "Field validation, EXAM_SCORE_OUT_OF_RANGE",
  })
  @ApiForbiddenResponse({ description: "No `session.manage` on the course." })
  @ApiNotFoundResponse({
    description: "LESSON_NOT_FOUND, EXAM_NOT_FOUND, EXAM_TALEBE_NOT_FOUND",
  })
  @Authz(PERMISSIONS.SESSION_MANAGE, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Put("lessons/:id/exam-results/:userId")
  saveResult(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: SaveExamResultDto
  ): Promise<ExamResultResponse> {
    return this.service.saveResult(request.user, id, userId, dto);
  }

  @ApiOperation({
    summary: "Open an exam's results to its talebe",
    description:
      '"Sonuçları talebelere aç": `session.manage` on the course. From then on each talebe reads their own score on `GET /courses/:id/my-grades`; before it, nobody but the course team does. Once only: opening them again changes nothing and tells nobody. The first time, the course\'s talebe are told (`EXAM_RESULTS_RELEASED`) and it is written to `audit_log` as `exam.release`.',
    operationId: "releaseExamResults",
  })
  @ApiOkResponse({ type: ExamReleaseResponse })
  @ApiForbiddenResponse({ description: "No `session.manage` on the course." })
  @ApiNotFoundResponse({ description: "LESSON_NOT_FOUND, EXAM_NOT_FOUND" })
  @Authz(PERMISSIONS.SESSION_MANAGE, byLessonCourse)
  @HttpCode(HttpStatus.OK)
  @Post("lessons/:id/exam-results/release")
  release(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<ExamReleaseResponse> {
    return this.service.release(request.user, id);
  }

  @ApiOperation({
    summary: "The caller's own grades in a course",
    description:
      '"Notlarım": only the caller\'s own. Each exam of the course, with the score or "Girmedi" only once its results are opened (`released`), and each memorisation homework with the mark given (null is "Bekliyor"). Read on the terms of `GET /courses/:id/my-submissions`: a course in a passive scope is closed (403 GRADES_FORBIDDEN), and a hidden course is not found. To a caller the content is closed to (no `course.view_details`: a stranger, a removed or barred talebe) only their own is listed: an exam whose result for them was opened, a homework they were marked on.',
    operationId: "getMyGrades",
  })
  @ApiOkResponse({ type: MyGradesResponse })
  @ApiForbiddenResponse({ description: "GRADES_FORBIDDEN" })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(PERMISSIONS.COURSE_VIEW, byExistingCourse)
  // Per-user answer; no shared cache may keep it.
  @Header("Cache-Control", "private, no-store")
  @Get("courses/:id/my-grades")
  myGrades(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<MyGradesResponse> {
    return this.service.myGrades(request.user, id);
  }

  @ApiOperation({
    summary: "How the medrese's courses' exams went",
    description:
      "For whoever reads the medrese's courses (`GET /madrasahs/:id/courses`): each course of the medrese holding an exam, with how many results were entered with a score and as \"Girmedi\", and the mean score as a share of each exam's `maxScore`. Counts only; no talebe is named.",
    operationId: "getMadrasahExamSummary",
  })
  @ApiOkResponse({ type: MadrasahExamSummaryResponse, isArray: true })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Authz(
    [
      PERMISSIONS.MADRASAH_COURSE_OPEN,
      PERMISSIONS.MADRASAH_COURSE_HIDE,
      PERMISSIONS.MADRASAH_MUDERRIS_MANAGE,
    ],
    byExistingMadrasah
  )
  @Header("Cache-Control", "private, no-store")
  @Get("madrasahs/:id/exam-summary")
  madrasahSummary(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<MadrasahExamSummaryResponse[]> {
    return this.service.madrasahSummary(id);
  }
}
