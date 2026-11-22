import {
  AuthGuard,
  Authz,
  AuthzGuard,
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
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { AuthorizedRequest } from "../course/interfaces/authorized-request.interface";
import { byExistingMadrasah } from "../madrasah/madrasah.controller";
import {
  CourseZerothQuestionResponse,
  MadrasahZerothQuestionResponse,
  SaveZerothQuestionDto,
} from "./dto/zeroth-question.dto";
import { ZerothQuestionService } from "./zeroth-question.service";

const FORBIDDEN = "No `madrasah.settings_edit` on the medrese.";
const FORBIDDEN_COURSE = "No `exam.prepare` on the course.";

/**
 * A medrese's zeroth question (MDRS-299), on nazar's Medrese ayarları: one
 * per medrese, asked before every exam of its courses, about the hadith the
 * page shows fixed. Both routes ask `madrasah.settings_edit`, as the
 * settings do. A course may ask a question of its own instead (the owner,
 * 22 Nov 2026: "medreseninki default olur ders özelinde değişebilir"); its
 * three routes ask `exam.prepare`, as preparing its exams does.
 */
@ApiTags("online-exams")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class ZerothQuestionController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly service: ZerothQuestionService) {}

  @ApiOperation({
    summary: "The medrese's zeroth question",
    description:
      'Medrese ayarları\' "Sınavların sıfırıncı sorusu": the question and its options in their order. Empty while the medrese has none; an exam of its courses is then not published.',
    operationId: "getMadrasahZerothQuestion",
  })
  @ApiOkResponse({ type: MadrasahZerothQuestionResponse })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @ApiNotFoundResponse({ description: "MADRASAH_NOT_FOUND" })
  @Authz(PERMISSIONS.MADRASAH_SETTINGS_EDIT, byExistingMadrasah)
  @Get("madrasahs/:id/exam-zeroth-question")
  get(
    @Param("id", ParseUUIDPipe) madrasahId: string
  ): Promise<MadrasahZerothQuestionResponse> {
    return this.service.get(madrasahId);
  }

  @ApiOperation({
    summary: "Save the medrese's zeroth question",
    description:
      "Replaces the question and all its options. The exams already published keep the one they were published with. Written to `audit_log` as `madrasah.zeroth_question.update` with what it was and what it is; a save that changes nothing writes nothing.",
    operationId: "saveMadrasahZerothQuestion",
  })
  @ApiOkResponse({ type: MadrasahZerothQuestionResponse })
  @ApiBadRequestResponse({ description: "VALIDATION_ERROR" })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @ApiNotFoundResponse({ description: "MADRASAH_NOT_FOUND" })
  @Authz(PERMISSIONS.MADRASAH_SETTINGS_EDIT, byExistingMadrasah)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Put("madrasahs/:id/exam-zeroth-question")
  save(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) madrasahId: string,
    @Body() dto: SaveZerothQuestionDto
  ): Promise<MadrasahZerothQuestionResponse> {
    return this.service.save(
      madrasahId,
      { text: dto.text, options: dto.options },
      request.user.sub
    );
  }

  @ApiOperation({
    summary: "A course's zeroth question",
    description:
      "The course's own question if it has one, its medrese's (the default), and which one its exams ask as they are published. A course of a köşk alone has no medrese's question; with no question of its own, its exams are not published.",
    operationId: "getCourseZerothQuestion",
  })
  @ApiOkResponse({ type: CourseZerothQuestionResponse })
  @ApiForbiddenResponse({ description: FORBIDDEN_COURSE })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(PERMISSIONS.EXAM_PREPARE, byParam(ENTITIES.COURSE, "id"))
  @Get("courses/:id/exam-zeroth-question")
  getForCourse(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) courseId: string
  ): Promise<CourseZerothQuestionResponse> {
    return this.service.getForCourse(courseId, request.user);
  }

  @ApiOperation({
    summary: "Give the course a zeroth question of its own",
    description:
      "Replaces the course's own question and all its options; its exams ask it instead of the medrese's from the next one published. Written to `audit_log` as `course.zeroth_question.update`; a save that changes nothing writes nothing.",
    operationId: "saveCourseZerothQuestion",
  })
  @ApiOkResponse({ type: CourseZerothQuestionResponse })
  @ApiBadRequestResponse({ description: "VALIDATION_ERROR" })
  @ApiForbiddenResponse({ description: FORBIDDEN_COURSE })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(PERMISSIONS.EXAM_PREPARE, byParam(ENTITIES.COURSE, "id"))
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Put("courses/:id/exam-zeroth-question")
  saveForCourse(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) courseId: string,
    @Body() dto: SaveZerothQuestionDto
  ): Promise<CourseZerothQuestionResponse> {
    return this.service.saveForCourse(
      courseId,
      { text: dto.text, options: dto.options },
      request.user
    );
  }

  @ApiOperation({
    summary: "Back to the medrese's zeroth question",
    description:
      "Takes the course's own question off; its exams ask the medrese's again from the next one published. Written to `audit_log` as `course.zeroth_question.delete`; nothing is written when the course had none.",
    operationId: "removeCourseZerothQuestion",
  })
  @ApiOkResponse({ type: CourseZerothQuestionResponse })
  @ApiForbiddenResponse({ description: FORBIDDEN_COURSE })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(PERMISSIONS.EXAM_PREPARE, byParam(ENTITIES.COURSE, "id"))
  @Delete("courses/:id/exam-zeroth-question")
  removeForCourse(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) courseId: string
  ): Promise<CourseZerothQuestionResponse> {
    return this.service.removeForCourse(courseId, request.user);
  }
}
