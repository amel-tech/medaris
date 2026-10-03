import { AuthGuard } from "@medaris/common";
import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import {
  CreatedIdResponse,
  RejectReasonDto,
} from "../deck-review/dto/deck-review.dto";
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import {
  AcceptCourseRequestDto,
  COURSE_REQUEST_TABS,
  CourseRequestListResponse,
  type CourseRequestTab,
  CreateCourseRequestDto,
} from "./course-request.dto";
import { CourseRequestService } from "./course-request.service";

/**
 * Medrese dışı ders talepleri (MDRS-181, nizam/39). No `AuthzGuard`: the
 * matrix has no entity for a request, so `CourseRequestService` decides.
 */
@ApiTags("kosks")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class CourseRequestController {
  constructor(private readonly requests: CourseRequestService) {}

  @ApiOperation({
    summary: "Ask a köşk to open a course for a medrese",
    description:
      "Sent by the başmüderris of the medrese named in the body; anyone else gets 403.",
    operationId: "createCourseRequest",
  })
  @ApiCreatedResponse({ type: CreatedIdResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Post("kosks/:id/course-requests")
  async create(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateCourseRequestDto
  ): Promise<CreatedIdResponse> {
    return { id: await this.requests.create(request.user, id, dto) };
  }

  @ApiOperation({
    summary: "The course requests a köşk received (Bekleyen / Karara bağlanan)",
    description:
      "Waiting ones oldest first, answered ones newest first, with both tab counts. The köşk's nazımları and the başnazım only.",
    operationId: "listCourseRequests",
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: COURSE_REQUEST_TABS,
  })
  @ApiOkResponse({ type: CourseRequestListResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get("kosks/:id/course-requests")
  list(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query(
      "status",
      new DefaultValuePipe("PENDING"),
      new ParseEnumPipe(COURSE_REQUEST_TABS)
    )
    status: CourseRequestTab
  ): Promise<CourseRequestListResponse> {
    return this.requests.list(request.user, id, status);
  }

  @ApiOperation({
    summary: "Accept the request with the course opened from it (Kabul et)",
    description:
      "Open the course first (the 'Ders aç' form, filled in from the request); this marks the request accepted. 409 (COURSE_REQUEST_NOT_PENDING) when it was answered already.",
    operationId: "acceptCourseRequest",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "COURSE_REQUEST_NOT_PENDING" })
  @Post("course-requests/:id/accept")
  @HttpCode(HttpStatus.NO_CONTENT)
  accept(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AcceptCourseRequestDto
  ): Promise<void> {
    return this.requests.accept(request.user, id, dto.courseId);
  }

  @ApiOperation({
    summary: "Refuse the request (Reddet)",
    description: "The reason is required. 409 when it was answered already.",
    operationId: "rejectCourseRequest",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "COURSE_REQUEST_NOT_PENDING" })
  @Post("course-requests/:id/reject")
  @HttpCode(HttpStatus.NO_CONTENT)
  reject(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RejectReasonDto
  ): Promise<void> {
    return this.requests.reject(request.user, id, dto.reason);
  }
}
