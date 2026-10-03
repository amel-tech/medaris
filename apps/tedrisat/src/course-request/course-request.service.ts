import {
  AuthenticatedUser,
  AuthzService,
  ConflictError,
  ErrorContext,
  ForbiddenError,
  NotFoundError,
} from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { KoskNotFoundError } from "../kosk/errors/kosk-not-found.error";
import { KoskService } from "../kosk/kosk.service";
import { MadrasahNotFoundError } from "../madrasah/errors/madrasah-not-found.error";
import type {
  CourseRequestListResponse,
  CourseRequestTab,
  CreateCourseRequestDto,
} from "./course-request.dto";
import {
  CourseRequestRepository,
  type ICourseRequest,
} from "./course-request.repository";

/** Not this köşk's nazım, or not the başmüderris of the medrese the request is sent from (MDRS-181). */
export class CourseRequestForbiddenError extends ForbiddenError {
  static readonly code = "COURSE_REQUEST_FORBIDDEN";

  constructor(
    message = "You may not use course requests here",
    context?: ErrorContext
  ) {
    super(CourseRequestForbiddenError.code, message, context);
  }
}

export class CourseRequestNotFoundError extends NotFoundError {
  static readonly code = "COURSE_REQUEST_NOT_FOUND";

  constructor(id: string, context?: ErrorContext) {
    super(CourseRequestNotFoundError.code, `No course request ${id}`, context);
  }
}

/** The request was answered while the page was open. */
export class CourseRequestNotPendingError extends ConflictError {
  static readonly code = "COURSE_REQUEST_NOT_PENDING";

  constructor(id: string, context?: ErrorContext) {
    super(
      CourseRequestNotPendingError.code,
      `Course request ${id} has been answered already`,
      context
    );
  }
}

/** The course named in an acceptance does not exist in the request's köşk. */
export class CourseRequestCourseNotFoundError extends NotFoundError {
  static readonly code = "COURSE_REQUEST_COURSE_NOT_FOUND";

  constructor(courseId: string, context?: ErrorContext) {
    super(
      CourseRequestCourseNotFoundError.code,
      `Course ${courseId} is not a course of the request's köşk`,
      context
    );
  }
}

const LIST_LIMIT = 100;

/**
 * Medrese dışı ders talepleri (MDRS-181, nizam/39). A başmüderris asks a köşk
 * to open a course for their medrese; the köşk's nazımı (or the başnazım)
 * accepts it by opening the course, or refuses it with a reason. Authorization
 * is here, not in `@Authz`: the matrix has no entity for a request.
 */
@Injectable()
export class CourseRequestService {
  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: CourseRequestRepository,
    private readonly koskService: KoskService,
    private readonly authz: AuthzService
  ) {}

  /** The başmüderris of a medrese asks the köşk for a course. */
  async create(
    user: AuthenticatedUser,
    koskId: string,
    dto: CreateCourseRequestDto
  ): Promise<string> {
    if (!(await this.koskService.exists(koskId))) {
      throw new KoskNotFoundError(koskId);
    }
    if (!(await this.repo.madrasahExists(dto.madrasahId))) {
      throw new MadrasahNotFoundError(dto.madrasahId);
    }
    if (!(await this.repo.isHeadMuderris(user.sub, dto.madrasahId))) {
      throw new CourseRequestForbiddenError(
        "Only the başmüderris of the medrese may send its course requests"
      );
    }
    return this.repo.create({
      koskId,
      madrasahId: dto.madrasahId,
      title: dto.title,
      reason: dto.reason,
      requestedBy: user.sub,
    });
  }

  async list(
    user: AuthenticatedUser,
    koskId: string,
    tab: CourseRequestTab
  ): Promise<CourseRequestListResponse> {
    await this.assertKoskNazim(user, koskId);
    const [items, counts] = await Promise.all([
      this.repo.list(koskId, tab, LIST_LIMIT),
      this.repo.counts(koskId),
    ]);
    return {
      items,
      pendingCount: counts.pending,
      decidedCount: counts.decided,
    };
  }

  /** The course was opened from the request; the request is accepted with it. */
  async accept(
    user: AuthenticatedUser,
    id: string,
    courseId: string
  ): Promise<void> {
    const request = await this.require(id);
    await this.assertKoskNazim(user, request.kosk.id);
    if (request.status !== "PENDING") {
      throw new CourseRequestNotPendingError(id);
    }
    if (!(await this.repo.courseInKosk(courseId, request.kosk.id))) {
      throw new CourseRequestCourseNotFoundError(courseId);
    }
    await this.answer(user, request, { outcome: "ACCEPTED", courseId });
  }

  async reject(
    user: AuthenticatedUser,
    id: string,
    reason: string
  ): Promise<void> {
    const request = await this.require(id);
    await this.assertKoskNazim(user, request.kosk.id);
    await this.answer(user, request, {
      outcome: "REJECTED",
      rejectReason: reason.trim(),
    });
  }

  private async answer(
    user: AuthenticatedUser,
    request: ICourseRequest,
    result: {
      outcome: "ACCEPTED" | "REJECTED";
      courseId?: string;
      rejectReason?: string;
    }
  ): Promise<void> {
    const decided = await this.repo.decide({
      id: request.id,
      actorId: user.sub,
      title: request.title,
      koskId: request.kosk.id,
      madrasahId: request.madrasah.id,
      ...result,
    });
    if (!decided) throw new CourseRequestNotPendingError(request.id);
  }

  private async require(id: string): Promise<ICourseRequest> {
    const request = await this.repo.find(id);
    if (!request) throw new CourseRequestNotFoundError(id);
    return request;
  }

  private async assertKoskNazim(
    user: AuthenticatedUser,
    koskId: string
  ): Promise<void> {
    if (!(await this.koskService.exists(koskId))) {
      throw new KoskNotFoundError(koskId);
    }
    if (this.authz.isSystemAdmin(user)) return;
    if (await this.koskService.isManager(koskId, user.sub)) return;
    throw new CourseRequestForbiddenError("You are not a nazım of this köşk");
  }
}
