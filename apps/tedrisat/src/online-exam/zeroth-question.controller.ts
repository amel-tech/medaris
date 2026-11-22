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
  MadrasahZerothQuestionResponse,
  SaveZerothQuestionDto,
} from "./dto/zeroth-question.dto";
import { ZerothQuestionService } from "./zeroth-question.service";

const FORBIDDEN = "No `madrasah.settings_edit` on the medrese.";

/**
 * A medrese's zeroth question (MDRS-299), on nazar's Medrese ayarları: one
 * per medrese, asked before every exam of its courses, about the hadith the
 * page shows fixed. Both routes ask `madrasah.settings_edit`, as the
 * settings do.
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
}
