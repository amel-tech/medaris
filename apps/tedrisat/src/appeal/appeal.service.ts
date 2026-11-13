import {
  AuthenticatedUser,
  ConflictError,
  ErrorContext,
  NotFoundError,
  PERMISSIONS,
} from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { PlatformAccessService } from "../platform-access/platform-access.service";
import type {
  AppealListResponse,
  AppealResponse,
  AppealTab,
  CreateAppealDto,
  MadrasahAppealRowResponse,
} from "./appeal.dto";
import { AppealRepository } from "./appeal.repository";

export class AppealNotFoundError extends NotFoundError {
  static readonly code = "APPEAL_NOT_FOUND";

  constructor(id: string, context?: ErrorContext) {
    super(AppealNotFoundError.code, `No appeal ${id}`, context);
  }
}

/** The course request is not one of this medrese's. */
export class AppealRequestNotFoundError extends NotFoundError {
  static readonly code = "APPEAL_REQUEST_NOT_FOUND";

  constructor(id: string, context?: ErrorContext) {
    super(
      AppealRequestNotFoundError.code,
      `No course request ${id} in this medrese`,
      context
    );
  }
}

/** Only a request the köşk refused can be appealed. */
export class AppealRequestNotRejectedError extends ConflictError {
  static readonly code = "APPEAL_REQUEST_NOT_REJECTED";

  constructor(id: string, context?: ErrorContext) {
    super(
      AppealRequestNotRejectedError.code,
      `Course request ${id} was not refused`,
      context
    );
  }
}

/** A request is appealed once. */
export class AppealExistsError extends ConflictError {
  static readonly code = "APPEAL_EXISTS";

  constructor(id: string, context?: ErrorContext) {
    super(
      AppealExistsError.code,
      `Course request ${id} has been appealed already`,
      context
    );
  }
}

/** The appeal was decided while the page was open. */
export class AppealNotPendingError extends ConflictError {
  static readonly code = "APPEAL_NOT_PENDING";

  constructor(id: string, context?: ErrorContext) {
    super(
      AppealNotPendingError.code,
      `Appeal ${id} has been decided already`,
      context
    );
  }
}

const LIST_LIMIT = 100;

/**
 * İtirazlar: a medrese appeals a köşk's refusal of its course request
 * (`madrasah.appeal_open`, checked by `@Authz` on the route), and the Medaris
 * başnazımı or a Medaris nazımı holding `platform.appeal_decide` decides it.
 * Accepting sends the request back to the köşk as PENDING; refusing closes it
 * with a note the medrese reads.
 */
@Injectable()
export class AppealService {
  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: AppealRepository,
    private readonly access: PlatformAccessService
  ) {}

  madrasahRows(madrasahId: string): Promise<MadrasahAppealRowResponse[]> {
    return this.repo.madrasahRows(madrasahId, LIST_LIMIT);
  }

  async create(
    user: AuthenticatedUser,
    madrasahId: string,
    dto: CreateAppealDto
  ): Promise<string> {
    const request = await this.repo.findRequest(dto.courseRequestId);
    if (!request || request.madrasahId !== madrasahId) {
      throw new AppealRequestNotFoundError(dto.courseRequestId);
    }
    if (request.status !== "REJECTED") {
      throw new AppealRequestNotRejectedError(request.id);
    }
    const id = await this.repo.create({
      madrasahId,
      courseRequestId: request.id,
      reason: dto.reason,
      createdBy: user.sub,
      title: request.title,
      koskId: request.koskId,
    });
    if (!id) throw new AppealExistsError(request.id);
    return id;
  }

  async list(
    user: AuthenticatedUser,
    tab: AppealTab
  ): Promise<AppealListResponse> {
    await this.access.assert(user, PERMISSIONS.PLATFORM_APPEAL_DECIDE);
    const [items, counts] = await Promise.all([
      this.repo.list(tab, LIST_LIMIT),
      this.repo.counts(),
    ]);
    return {
      items,
      pendingCount: counts.pending,
      decidedCount: counts.decided,
    };
  }

  accept(user: AuthenticatedUser, id: string): Promise<void> {
    return this.decide(user, id, "ACCEPTED", null);
  }

  reject(user: AuthenticatedUser, id: string, note: string): Promise<void> {
    return this.decide(user, id, "REJECTED", note.trim());
  }

  private async decide(
    user: AuthenticatedUser,
    id: string,
    outcome: "ACCEPTED" | "REJECTED",
    note: string | null
  ): Promise<void> {
    const actorId = await this.access.assert(
      user,
      PERMISSIONS.PLATFORM_APPEAL_DECIDE
    );
    const appeal: AppealResponse | null = await this.repo.find(id);
    if (!appeal) throw new AppealNotFoundError(id);
    if (appeal.status !== "PENDING") throw new AppealNotPendingError(id);
    const decided = await this.repo.decide({ appeal, actorId, outcome, note });
    if (!decided) throw new AppealNotPendingError(id);
  }
}
