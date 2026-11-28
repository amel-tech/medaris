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
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { byExistingCourse } from "../course/course.controller";
import { AuthorizedRequest } from "../course/interfaces/authorized-request.interface";
import {
  CourseTermRepository,
  type ICourseTerm,
} from "./course-term.repository";
import {
  COURSE_TERMS_MAX,
  CourseTermResponse,
  CreateCourseTermDto,
  UpdateCourseTermDto,
} from "./dto/course-term.dto";
import {
  CourseTermNotFoundError,
  CourseTermsFullError,
} from "./errors/course-term.errors";

const WHO_WRITES =
  "Whoever holds `course.edit` on the course: its müderris, its nazırı and the managers above it.";

/**
 * A course's glossary (lügat): the terms its müderris defines, each with its
 * Arabic spelling, its meaning in the language, its meaning as a term and an
 * example.
 */
@ApiTags("courses")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("courses/:id/terms")
export class CourseTermController {
  constructor(private readonly terms: CourseTermRepository) {}

  @ApiOperation({
    summary: "A course's glossary",
    description:
      "Every term of the course, in the order they were added; the reader sorts and searches. Read by whoever reads the course's content: an enrolled talebe and the course's staff.",
    operationId: "listCourseTerms",
  })
  @ApiOkResponse({ type: [CourseTermResponse] })
  @ApiForbiddenResponse({ description: "No `course.view_details`." })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(PERMISSIONS.COURSE_VIEW_DETAILS, byExistingCourse)
  @Header("Cache-Control", "private, no-store")
  @Get()
  list(@Param("id", ParseUUIDPipe) id: string): Promise<ICourseTerm[]> {
    return this.terms.findByCourse(id);
  }

  @ApiOperation({
    summary: "Add a term to a course's glossary",
    description: `Only the term itself is required; a text left out or empty is kept as null. Every text is stored as typed and shown as plain text. At most ${COURSE_TERMS_MAX} terms a course (400 COURSE_TERMS_FULL). ${WHO_WRITES}`,
    operationId: "createCourseTerm",
  })
  @ApiCreatedResponse({ type: CourseTermResponse })
  @ApiBadRequestResponse({ description: "Field validation, COURSE_TERMS_FULL" })
  @ApiForbiddenResponse({ description: "No `course.edit` on the course." })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(PERMISSIONS.COURSE_EDIT, byExistingCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Post()
  async create(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateCourseTermDto
  ): Promise<ICourseTerm> {
    if ((await this.terms.countByCourse(id)) >= COURSE_TERMS_MAX) {
      throw new CourseTermsFullError(COURSE_TERMS_MAX);
    }
    return this.terms.insert(id, request.user.sub, {
      term: dto.term,
      arabic: dto.arabic ?? null,
      lexicalMeaning: dto.lexicalMeaning ?? null,
      technicalMeaning: dto.technicalMeaning ?? null,
      example: dto.example ?? null,
    });
  }

  @ApiOperation({
    summary: "Edit a term of a course's glossary",
    description: `A key left out stays as it is; a text sent as null or empty is cleared. ${WHO_WRITES}`,
    operationId: "updateCourseTerm",
  })
  @ApiOkResponse({ type: CourseTermResponse })
  @ApiBadRequestResponse({ description: "Field validation" })
  @ApiForbiddenResponse({ description: "No `course.edit` on the course." })
  @ApiNotFoundResponse({
    description: "COURSE_NOT_FOUND, COURSE_TERM_NOT_FOUND",
  })
  @Authz(PERMISSIONS.COURSE_EDIT, byExistingCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Patch(":termId")
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("termId", ParseUUIDPipe) termId: string,
    @Body() dto: UpdateCourseTermDto
  ): Promise<ICourseTerm> {
    const saved = await this.terms.update(id, termId, {
      term: dto.term,
      arabic: dto.arabic,
      lexicalMeaning: dto.lexicalMeaning,
      technicalMeaning: dto.technicalMeaning,
      example: dto.example,
    });
    if (!saved) throw new CourseTermNotFoundError(termId);
    return saved;
  }

  @ApiOperation({
    summary: "Delete a term of a course's glossary",
    description: `The term is removed for good; there is no history. ${WHO_WRITES}`,
    operationId: "deleteCourseTerm",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: "No `course.edit` on the course." })
  @ApiNotFoundResponse({
    description: "COURSE_NOT_FOUND, COURSE_TERM_NOT_FOUND",
  })
  @Authz(PERMISSIONS.COURSE_EDIT, byExistingCourse)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(":termId")
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("termId", ParseUUIDPipe) termId: string
  ): Promise<void> {
    if (!(await this.terms.remove(id, termId))) {
      throw new CourseTermNotFoundError(termId);
    }
  }
}
