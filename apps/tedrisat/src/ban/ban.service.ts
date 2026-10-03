import { AuthenticatedUser, AuthzService } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { CourseNotFoundError } from "../course/errors/course-not-found.error";
import { BAN_SCOPES, type BanScope } from "../database/schema/ban.schema";
import { KoskNotFoundError } from "../kosk/errors/kosk-not-found.error";
import { KoskService } from "../kosk/kosk.service";
import {
  BanRepository,
  type IBan,
  type IBanEntry,
  type IRoleScopes,
} from "./ban.repository";
import {
  BAN_TIERS,
  type BanRole,
  type BanTier,
  highestRole,
  MAY_BAN_ROLES,
  mayBanKosk,
  mayLift,
  SYSTEM_ADMIN_ROLE,
  tierOfRole,
} from "./ban-tier";
import type { BanStatus, CreateBanDto, LiftBanDto } from "./dto/ban.dto";
import {
  BanActiveError,
  BanAlreadyLiftedError,
  BanForbiddenError,
  BanLiftForbiddenError,
  BanNotFoundError,
  BanTargetInvalidError,
} from "./errors/ban-errors";

const RECENT_MS = 24 * 3_600_000;

/** A ban as the API sends it, before the DTO's own shape. */
export interface IBanView extends IBanEntry {
  viewerMayLift: boolean;
  viewerMayExtend: boolean;
}

export interface IBanList {
  items: IBanView[];
  activeCount: number;
  liftedCount: number;
  recentCount: number;
}

interface IStanding {
  role: BanRole;
  tier: BanTier;
}

/**
 * Bans (MDRS-177, screens nizam/41 and nizam/42): a talebe barred from a
 * course or a whole köşk, lifted again with a reason.
 *
 * Authorization is here, not in `@Authz`: the matrix has no ban entity and
 * the decision is the kademe rule, which needs the ban in hand. The standing
 * of the caller is the highest-ranked role they hold where the ban sits;
 * SYSTEM_ADMIN is the top of the ladder (`ban-tier.ts`).
 */
@Injectable()
export class BanService {
  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: BanRepository,
    private readonly koskService: KoskService,
    private readonly authz: AuthzService
  ) {}

  /** Bars a talebe from a course or its köşk; a second request for the same bar is the first. */
  async create(
    user: AuthenticatedUser,
    courseId: string,
    dto: CreateBanDto
  ): Promise<IBanView> {
    const course = await this.repo.findCourse(courseId);
    if (!course) throw new CourseNotFoundError(courseId);
    const scopes: IRoleScopes = {
      koskId: course.koskId,
      courseId: course.id,
      madrasahId: course.madrasahId,
    };

    const standing = await this.standing(user, scopes);
    if (!standing || !MAY_BAN_ROLES.includes(standing.role)) {
      throw new BanForbiddenError("You may not bar talebe from this course");
    }
    const scope = dto.scope as BanScope;
    if (scope === BAN_SCOPES.KOSK && !mayBanKosk(standing.tier)) {
      throw new BanForbiddenError(
        "Only a köşk nazımı or above may bar a talebe from the whole köşk"
      );
    }
    if (dto.userId === user.sub) {
      throw new BanTargetInvalidError("You cannot bar yourself");
    }
    const targetRoles = await this.repo.rolesHeld(dto.userId, scopes);
    if (targetRoles.some((r) => MAY_BAN_ROLES.includes(r))) {
      throw new BanTargetInvalidError(
        "Someone who runs this course cannot be barred from it"
      );
    }

    const { ban } = await this.repo.create({
      userId: dto.userId,
      koskId: course.koskId,
      courseId: scope === BAN_SCOPES.COURSE ? course.id : null,
      scope,
      // A KOSK ban made from a course remembers which course it was widened from.
      extendedFromCourseId: scope === BAN_SCOPES.KOSK ? course.id : null,
      reason: dto.reason.trim(),
      bannedBy: user.sub,
      bannedRole: standing.role,
      bannedTier: standing.tier,
    });
    return this.view(ban.id, standing.tier, new Set());
  }

  /** A köşk's bans for its nazım (and the başnazım), with the counts the tabs show. */
  async listForKosk(
    user: AuthenticatedUser,
    koskId: string,
    status: BanStatus
  ): Promise<IBanList> {
    if (!(await this.koskService.exists(koskId))) {
      throw new KoskNotFoundError(koskId);
    }
    const standing = await this.standing(user, {
      koskId,
      courseId: null,
      madrasahId: null,
    });
    if (!standing || standing.tier < BAN_TIERS.KOSK) {
      throw new BanForbiddenError("You are not a nazım of this köşk");
    }
    const [entries, counts, open] = await Promise.all([
      this.repo.listByKosk(koskId, status),
      this.repo.counts(koskId, new Date(Date.now() - RECENT_MS)),
      status === "ACTIVE" ? undefined : this.repo.listByKosk(koskId, "ACTIVE"),
    ]);
    const widened = new Set(
      (open ?? entries)
        .filter((e) => e.scope === BAN_SCOPES.KOSK)
        .map((e) => e.userId)
    );
    return {
      items: entries.map((e) => this.annotate(e, standing.tier, widened)),
      activeCount: counts.active,
      liftedCount: counts.lifted,
      recentCount: counts.recent,
    };
  }

  /** Lifts a ban with a reason, if the caller's kademe reaches the one that placed it. */
  async lift(
    user: AuthenticatedUser,
    banId: string,
    dto: LiftBanDto
  ): Promise<IBanView> {
    const ban = await this.repo.findById(banId);
    if (!ban) throw new BanNotFoundError(banId);
    if (ban.liftedAt) throw new BanAlreadyLiftedError(banId);

    const standing = await this.standingFor(user, ban);
    if (
      !standing ||
      !MAY_BAN_ROLES.includes(standing.role) ||
      !mayLift(standing.tier, ban.bannedTier)
    ) {
      throw new BanLiftForbiddenError(banId);
    }
    const lifted = await this.repo.lift(banId, {
      liftedBy: user.sub,
      liftReason: dto.reason.trim(),
      role: standing.role,
    });
    if (!lifted) throw new BanAlreadyLiftedError(banId);
    return this.view(banId, standing.tier, new Set());
  }

  /** Whether an open ban bars the person from the course. */
  isBarred(userId: string, courseId: string): Promise<boolean> {
    return this.repo.isBarredFromCourse(userId, courseId);
  }

  /** Refuses with `BanActiveError` when an open ban bars the person from the course. */
  async assertNotBarred(userId: string, courseId: string): Promise<void> {
    if (await this.repo.isBarredFromCourse(userId, courseId)) {
      throw new BanActiveError(courseId);
    }
  }

  /** The open ban on each person in the course, for the roster. */
  async openBansIn(
    courseId: string,
    koskId: string
  ): Promise<Map<string, IBan>> {
    return this.repo.openBansInCourse(courseId, koskId);
  }

  private async view(
    banId: string,
    viewerTier: BanTier,
    widened: Set<string>
  ): Promise<IBanView> {
    const entry = await this.repo.findEntry(banId);
    if (!entry) throw new BanNotFoundError(banId);
    return this.annotate(entry, viewerTier, widened);
  }

  private annotate(
    entry: IBanEntry,
    viewerTier: BanTier,
    widened: Set<string>
  ): IBanView {
    const isOpen = entry.liftedAt === null;
    return {
      ...entry,
      viewerMayLift: isOpen && mayLift(viewerTier, entry.bannedTier),
      viewerMayExtend:
        isOpen &&
        entry.scope === BAN_SCOPES.COURSE &&
        mayBanKosk(viewerTier) &&
        !widened.has(entry.userId),
    };
  }

  /** The caller's highest standing where the ban sits. */
  private standingFor(
    user: AuthenticatedUser,
    ban: IBan
  ): Promise<IStanding | null> {
    return this.standingAtCourse(user, ban.koskId, ban.courseId);
  }

  private async standingAtCourse(
    user: AuthenticatedUser,
    koskId: string,
    courseId: string | null
  ): Promise<IStanding | null> {
    const course = courseId ? await this.repo.findCourse(courseId) : null;
    return this.standing(user, {
      koskId,
      courseId,
      madrasahId: course?.madrasahId ?? null,
    });
  }

  private async standing(
    user: AuthenticatedUser,
    scopes: IRoleScopes
  ): Promise<IStanding | null> {
    if (this.authz.isSystemAdmin(user)) {
      return { role: SYSTEM_ADMIN_ROLE, tier: tierOfRole(SYSTEM_ADMIN_ROLE) };
    }
    const held = await this.repo.rolesHeld(user.sub, scopes);
    // Only the roles that may moderate count: a medrese nazır's higher kademe
    // must not hide the müderris role the same person also holds.
    const role = highestRole(
      held.filter((r) => MAY_BAN_ROLES.includes(r)).map((r) => ({ role: r }))
    );
    return role ? { role, tier: tierOfRole(role) } : null;
  }
}
