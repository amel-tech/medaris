import {
  AuthGuard,
  Authz,
  AuthzGuard,
  byParam,
  ENTITIES,
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
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CourseDeckService } from "./course-deck.service";
import {
  CourseDeckManageResponse,
  CourseDeckStudentResponse,
  CreateCourseDeckDto,
  CreatedCourseDeckResponse,
  UpdateCourseDeckDto,
} from "./dto/course-deck.dto";
import { AuthorizedRequest } from "./interfaces/authorized-request.interface";

/**
 * A course's decks (ders destesi). The staff of the course, whoever holds
 * `deck.manage_course` in it, write and manage them; the enrolled talebe read
 * the published ones with their own progress. A deck's cards and imports stay
 * on `FlashcardController`, which the course-deck staff rule opens as well.
 */
@ApiTags("courses")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("courses")
export class CourseDecksController {
  constructor(private readonly service: CourseDeckService) {}

  @ApiOperation({
    summary: "The course's decks for its staff, drafts included",
    description:
      "Every deck of the course with its card count, its week and whether it is a draft, and the share of the enrolled talebe's MASTERED cards. Needs `deck.manage_course` in the course.",
    operationId: "getCourseDecksManage",
  })
  @ApiOkResponse({ type: CourseDeckManageResponse, isArray: true })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Authz(PERMISSIONS.DECK_MANAGE_COURSE, byParam(ENTITIES.COURSE))
  @Get(":id/decks/manage")
  manage(
    @Param("id", ParseUUIDPipe) courseId: string
  ): Promise<CourseDeckManageResponse[]> {
    return this.service.listForStaff(courseId);
  }

  @ApiOperation({
    summary: "Create a course deck",
    description:
      "The caller becomes its author. A week, when given, must be one of the course's weeks.",
    operationId: "createCourseDeck",
  })
  @ApiBody({ type: CreateCourseDeckDto })
  @ApiCreatedResponse({ type: CreatedCourseDeckResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Authz(PERMISSIONS.DECK_MANAGE_COURSE, byParam(ENTITIES.COURSE))
  @Post(":id/decks")
  create(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) courseId: string,
    @Body() dto: CreateCourseDeckDto
  ): Promise<{ id: string }> {
    return this.service.create(courseId, request.user.sub, dto);
  }

  @ApiOperation({
    summary: "Edit a course deck",
    description:
      "Title, description, week and draft. The card type is fixed. `weekId: null` takes the deck out of its week.",
    operationId: "updateCourseDeck",
  })
  @ApiBody({ type: UpdateCourseDeckDto })
  @ApiOkResponse({ type: CourseDeckManageResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Authz(PERMISSIONS.DECK_MANAGE_COURSE, byParam(ENTITIES.COURSE))
  @Patch(":id/decks/:deckId")
  update(
    @Param("id", ParseUUIDPipe) courseId: string,
    @Param("deckId", ParseUUIDPipe) deckId: string,
    @Body() dto: UpdateCourseDeckDto
  ): Promise<CourseDeckManageResponse> {
    return this.service.update(courseId, deckId, dto);
  }

  @ApiOperation({
    summary: "Delete a draft course deck with its cards",
    description:
      "Only a deck that is a draft can be deleted. A published deck answers 409 (COURSE_DECK_NOT_DRAFT): set `draft` to true first, which takes it from the talebe and keeps their progress.",
    operationId: "deleteCourseDeck",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "COURSE_DECK_NOT_DRAFT" })
  @Authz(PERMISSIONS.DECK_MANAGE_COURSE, byParam(ENTITIES.COURSE))
  @Delete(":id/decks/:deckId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param("id", ParseUUIDPipe) courseId: string,
    @Param("deckId", ParseUUIDPipe) deckId: string
  ): Promise<void> {
    await this.service.delete(courseId, deckId);
  }

  @ApiOperation({
    summary: "The course's decks for an enrolled talebe",
    description:
      "The published decks of the course with the caller's own progress. Drafts are left out. Needs an enrollment in the course.",
    operationId: "getCourseDecks",
  })
  @ApiOkResponse({ type: CourseDeckStudentResponse, isArray: true })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Authz(PERMISSIONS.COURSE_VIEW_DETAILS, byParam(ENTITIES.COURSE))
  @Get(":id/decks")
  list(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) courseId: string
  ): Promise<CourseDeckStudentResponse[]> {
    return this.service.listForStudent(courseId, request.user.sub);
  }
}
