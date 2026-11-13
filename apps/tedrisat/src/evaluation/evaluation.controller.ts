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
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  StreamableFile,
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
  ApiProduces,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { byExistingCourse } from "../course/course.controller";
import type { AuthorizedRequest } from "../course/interfaces/authorized-request.interface";
import { byLessonCourse } from "../course/lesson.controller";
import {
  EvaluationBoardResponse,
  EvaluationMarkResponse,
  OwnEvaluationResponse,
  SaveEvaluationDto,
} from "./dto/evaluation.dto";
import { EvaluationService } from "./evaluation.service";

/**
 * "Değerlendirme" (MDRS-248): the course team's marks on homework recited to
 * them, and the talebe's read of their own.
 */
@ApiTags("evaluations")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class EvaluationController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly service: EvaluationService) {}

  @ApiOperation({
    summary: "The course's evaluation board",
    description:
      '`session.manage` on the course. Rows are the talebe seated in the course (ENROLLED or COMPLETED), by name; columns are the memorisation homework on its live sessions (`kind` MEMORIZE), in programme order, each with how many are marked FULL ("18/30 tam"); `marks` are the marks given, and a cell with none is "Bekliyor". A hidden course or a draft is not found, as on its page.',
    operationId: "getEvaluationBoard",
  })
  @ApiOkResponse({ type: EvaluationBoardResponse })
  @ApiForbiddenResponse({ description: "No `session.manage` on the course." })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(PERMISSIONS.SESSION_MANAGE, byExistingCourse)
  @Header("Cache-Control", "private, no-store")
  @Get("courses/:id/evaluations")
  board(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<EvaluationBoardResponse> {
    return this.service.board(request.user, id);
  }

  @ApiOperation({
    summary: "The course's evaluation board as a spreadsheet",
    description:
      '"Excel indir" (MDRS-248): `session.manage` on the course, as the board. An .xlsx with a row per talebe ("Ad Soyad") and a column per memorisation homework and exam, in programme order: a mark, or a score or "Girmedi". `lang` (tr, en or ar; tr otherwise) picks the language of the headers and the words.',
    operationId: "exportEvaluationBoard",
  })
  @ApiProduces(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
  @ApiOkResponse({ type: StreamableFile })
  @ApiQuery({ name: "lang", required: false, enum: ["tr", "en", "ar"] })
  @ApiForbiddenResponse({ description: "No `session.manage` on the course." })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(PERMISSIONS.SESSION_MANAGE, byExistingCourse)
  @Header("Cache-Control", "private, no-store")
  @Get("courses/:id/evaluations/export")
  export(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("lang") lang?: string
  ): Promise<StreamableFile> {
    return this.service.exportBoard(request.user, id, lang);
  }

  @ApiOperation({
    summary: "Mark a talebe on a session's memorisation homework",
    description:
      '`session.manage` on the course, on a live session whose homework is recited (`kind` MEMORIZE; otherwise 404 MEMORIZATION_NOT_FOUND), for a talebe seated in its course (otherwise 404 EVALUATION_TALEBE_NOT_FOUND). Sets "Tam", "Eksik" or "Vermedi" with an optional short note, replacing an earlier mark; written to `audit_log` as `assignment_evaluation.save` with the note\'s length. A save that changes nothing writes nothing. A hidden session is LESSON_NOT_FOUND.',
    operationId: "saveEvaluation",
  })
  @ApiOkResponse({ type: EvaluationMarkResponse })
  @ApiBadRequestResponse({ description: "Field validation" })
  @ApiForbiddenResponse({ description: "No `session.manage` on the course." })
  @ApiNotFoundResponse({
    description:
      "LESSON_NOT_FOUND, MEMORIZATION_NOT_FOUND, EVALUATION_TALEBE_NOT_FOUND",
  })
  @Authz(PERMISSIONS.SESSION_MANAGE, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Put("lessons/:id/evaluations/:userId")
  save(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: SaveEvaluationDto
  ): Promise<EvaluationMarkResponse> {
    return this.service.save(
      request.user,
      id,
      userId,
      dto.status,
      dto.note ?? null
    );
  }

  @ApiOperation({
    summary: "The caller's own mark on a session's memorisation homework",
    description:
      'Only the caller\'s own: `status` null is "Bekliyor". Read on the terms of `GET /lessons/:id/submission`: a course in a passive scope is closed (403 EVALUATION_FORBIDDEN), and a hidden course is as not found as a session that is not there. A session whose homework is not a memorisation is 404 MEMORIZATION_NOT_FOUND.',
    operationId: "getMyEvaluation",
  })
  @ApiOkResponse({ type: OwnEvaluationResponse })
  @ApiForbiddenResponse({ description: "EVALUATION_FORBIDDEN" })
  @ApiNotFoundResponse({
    description: "LESSON_NOT_FOUND, MEMORIZATION_NOT_FOUND",
  })
  @Authz(PERMISSIONS.COURSE_VIEW, byLessonCourse)
  // Per-user answer; no shared cache may keep it.
  @Header("Cache-Control", "private, no-store")
  @Get("lessons/:id/evaluation")
  own(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<OwnEvaluationResponse> {
    return this.service.own(request.user, id);
  }
}
