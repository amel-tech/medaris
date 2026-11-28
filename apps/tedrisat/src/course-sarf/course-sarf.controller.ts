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
  Put,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
  CourseSarfRepository,
  type ICourseSarfRoot,
} from "./course-sarf.repository";
import {
  CourseSarfRootResponse,
  SaveCourseSarfRootDto,
} from "./dto/course-sarf.dto";
import {
  CourseSarfRootDoubledError,
  CourseSarfRootNotFoundError,
} from "./errors/course-sarf.errors";

const WHO_WRITES =
  "Whoever holds `course.edit` on the course: its müderris, its nazırı and the managers above it.";

/**
 * A course's sarf page: the roots its müderris chose. The twenty-four sîgas
 * and their çekim are written from each row in the browser by `@medaris/sarf`,
 * so the API keeps and serves only the choice.
 */
@ApiTags("courses")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("courses/:id/sarf-roots")
export class CourseSarfController {
  constructor(private readonly roots: CourseSarfRepository) {}

  @ApiOperation({
    summary: "The roots on a course's sarf page",
    description:
      "In the order they were added. Read by whoever reads the course's content: an enrolled talebe and the course's staff.",
    operationId: "listCourseSarfRoots",
  })
  @ApiOkResponse({ type: [CourseSarfRootResponse] })
  @ApiForbiddenResponse({ description: "No `course.view_details`." })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(PERMISSIONS.COURSE_VIEW_DETAILS, byExistingCourse)
  @Header("Cache-Control", "private, no-store")
  @Get()
  list(@Param("id", ParseUUIDPipe) id: string): Promise<ICourseSarfRoot[]> {
    return this.roots.findByCourse(id);
  }

  @ApiOperation({
    summary: "Put a root on a course's sarf page",
    description: `Adds the root in the given bâb, or, when the course already has it in that bâb, changes its mastar and its masdar's vezin; the row comes back either way. Sülâsî mücerred sâlim only: a root with a hamza or a weak letter fails field validation, a doubled one is 400 COURSE_SARF_ROOT_DOUBLED. ${WHO_WRITES}`,
    operationId: "saveCourseSarfRoot",
  })
  @ApiOkResponse({ type: CourseSarfRootResponse })
  @ApiBadRequestResponse({
    description: "Field validation, COURSE_SARF_ROOT_DOUBLED",
  })
  @ApiForbiddenResponse({ description: "No `course.edit` on the course." })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(PERMISSIONS.COURSE_EDIT, byExistingCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Put()
  save(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SaveCourseSarfRootDto
  ): Promise<ICourseSarfRoot> {
    const [, ayn, lam] = dto.kok.split(" ");
    if (ayn === lam) throw new CourseSarfRootDoubledError();
    return this.roots.save(id, request.user.sub, {
      kok: dto.kok,
      bab: dto.bab,
      mastar: dto.mastar ?? null,
      masdarVezin: dto.masdarVezin,
    });
  }

  @ApiOperation({
    summary: "Take a root off a course's sarf page",
    description: `The cards already drafted from it into a deck stay. ${WHO_WRITES}`,
    operationId: "deleteCourseSarfRoot",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: "No `course.edit` on the course." })
  @ApiNotFoundResponse({
    description: "COURSE_NOT_FOUND, COURSE_SARF_ROOT_NOT_FOUND",
  })
  @Authz(PERMISSIONS.COURSE_EDIT, byExistingCourse)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(":rootId")
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rootId", ParseUUIDPipe) rootId: string
  ): Promise<void> {
    if (!(await this.roots.remove(id, rootId))) {
      throw new CourseSarfRootNotFoundError(rootId);
    }
  }
}
