import { AuthenticatedUser, AuthzService } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { CourseNotFoundError } from "../course/errors/course-not-found.error";
import { BAN_SCOPES, type BanScope } from "../database/schema/ban.schema";
import { KoskNotFoundError } from "../kosk/errors/kosk-not-found.error";
import { KoskService } from "../kosk/kosk.service";
import { BanRepository, type IBan, type IBanEntry } from "./ban.repository";
import {
  BAN_TIERS,
  type BanRole,
  type BanTier,
  highestRole,
  type IBanScopes,
  type IHeldAssignment,
  MADRASAH_WIDE_ROLES,
  MAY_BAN_ROLES,
  MAY_MODERATE_ROLES,
  mayBanKosk,
  mayLift,
  SYSTEM_ADMIN_ROLE,
  standingAmong,
  tierOfRole,
} from "./ban-tier";
import type { BanStatus, CreateBanDto, LiftBanDto } from "./dto/ban.dto";
import type {
  BanReasonDto,
  CreateMadrasahBanDto,
} from "./dto/madrasah-ban.dto";
import {
  BanActiveError,
  BanAlreadyLiftedError,
  BanForbiddenError,
  BanLiftForbiddenError,
  BanNotEscalatableError,
  BanNotFoundError,
  BanPermanentRequestExistsError,
  BanPermanentRequestInvalidError,
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

/** A ban as the nazır portal lists it, with what the caller may do to it. */
export interface IMadrasahBanView extends IBanEntry {
  viewerMayLift: boolean;
  viewerMayEscalate: boolean;
  viewerMayRequestPermanent: boolean;
}

export interface IMadrasahBanList {
  items: IMadrasahBanView[];
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
    const scopes: IBanScopes = {
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
      madrasahId: null,
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
    if (!standing || !mayLift(standing.tier, ban.bannedTier)) {
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

  /**
   * A medrese's bans for its nazırs (nazir/11), with the counts the tabs show
   * and, per row, what the caller's kademe lets them do. The controller has
   * already authorized the caller against the medrese.
   */
  async listForMadrasah(
    user: AuthenticatedUser,
    madrasahId: string,
    query: { status: BanStatus; scope?: BanScope; courseId?: string }
  ): Promise<IMadrasahBanList> {
    const [entries, counts, widened, held] = await Promise.all([
      this.repo.listByMadrasah(madrasahId, query.status, query),
      this.repo.countsByMadrasah(madrasahId, new Date(Date.now() - RECENT_MS)),
      this.repo.openMadrasahBanUsers(madrasahId),
      this.repo.rolesOf(user.sub),
    ]);
    const admin = this.authz.isSystemAdmin(user);
    return {
      items: entries.map((e) =>
        this.annotateMadrasah(e, madrasahId, held, admin, widened)
      ),
      activeCount: counts.active,
      liftedCount: counts.lifted,
      recentCount: counts.recent,
    };
  }

  /**
   * Bars a talebe from one of the medrese's courses or from the whole medrese
   * (nazir/10 and nazir/11 "Yasakla"); a second request for the same bar is the
   * first. A medrese nazır's ban is the medrese's kademe: a köşk nazımı lifts
   * it, a course's müderris does not.
   */
  async createInMadrasah(
    user: AuthenticatedUser,
    madrasahId: string,
    dto: CreateMadrasahBanDto
  ): Promise<IMadrasahBanView> {
    const scope = dto.scope as BanScope;
    const course =
      scope === BAN_SCOPES.COURSE
        ? await this.repo.findCourse(dto.courseId as string)
        : null;
    if (scope === BAN_SCOPES.COURSE && course?.madrasahId !== madrasahId) {
      // Missing, or another medrese's: the same answer for both.
      throw new CourseNotFoundError(dto.courseId as string);
    }
    const scopes: IBanScopes = {
      koskId: course?.koskId ?? null,
      courseId: course?.id ?? null,
      madrasahId,
    };

    const standing = await this.standing(
      user,
      scopes,
      scope === BAN_SCOPES.MADRASAH ? MADRASAH_WIDE_ROLES : MAY_MODERATE_ROLES
    );
    if (!standing) {
      throw new BanForbiddenError(
        scope === BAN_SCOPES.MADRASAH
          ? "Only a medrese nazır or above may bar a talebe from the whole medrese"
          : "You may not bar talebe in this medrese"
      );
    }
    if (dto.userId === user.sub) {
      throw new BanTargetInvalidError("You cannot bar yourself");
    }
    const targetRoles = await this.repo.rolesHeld(dto.userId, scopes);
    if (targetRoles.some((r) => MAY_MODERATE_ROLES.includes(r))) {
      throw new BanTargetInvalidError(
        "Someone who runs this medrese or course cannot be barred from it"
      );
    }

    const { ban } = await this.repo.create({
      userId: dto.userId,
      koskId: course?.koskId ?? null,
      madrasahId: scope === BAN_SCOPES.MADRASAH ? madrasahId : null,
      courseId: course?.id ?? null,
      scope,
      extendedFromCourseId: null,
      reason: dto.reason.trim(),
      bannedBy: user.sub,
      bannedRole: standing.role,
      bannedTier: standing.tier,
    });
    return this.madrasahView(ban.id, user, madrasahId);
  }

  /**
   * Widens an open course ban of a medrese's course to the whole medrese
   * (nazir/11 "Medreseden de yasakla"): a second ban beside the first, which
   * stays, as a köşk's widening does. The person already barred from the
   * medrese gets that ban back.
   */
  async escalate(
    user: AuthenticatedUser,
    banId: string,
    dto: BanReasonDto
  ): Promise<IMadrasahBanView> {
    const ban = await this.repo.findById(banId);
    if (!ban) throw new BanNotFoundError(banId);
    if (ban.liftedAt) throw new BanAlreadyLiftedError(banId);
    const madrasahId = await this.madrasahOf(ban);
    if (ban.scope !== BAN_SCOPES.COURSE || !madrasahId) {
      throw new BanNotEscalatableError(banId);
    }

    const standing = await this.standingFor(user, ban, MADRASAH_WIDE_ROLES);
    if (!standing) {
      throw new BanForbiddenError(
        "Only a medrese nazır or above may widen a ban to the medrese"
      );
    }
    const { ban: wide } = await this.repo.create({
      userId: ban.userId,
      koskId: null,
      madrasahId,
      courseId: null,
      scope: BAN_SCOPES.MADRASAH,
      extendedFromCourseId: ban.courseId,
      reason: dto.reason.trim(),
      bannedBy: user.sub,
      bannedRole: standing.role,
      bannedTier: standing.tier,
    });
    return this.madrasahView(wide.id, user, madrasahId);
  }

  /**
   * Asks Medaris administration to make an open ban permanent (nazir/11
   * "Kalıcı yasak talebi aç"). Only the request is recorded; deciding it is a
   * later phase, and the ban stands as it was meanwhile.
   */
  async requestPermanent(
    user: AuthenticatedUser,
    banId: string,
    dto: BanReasonDto
  ): Promise<IMadrasahBanView> {
    const ban = await this.repo.findById(banId);
    if (!ban) throw new BanNotFoundError(banId);
    if (ban.liftedAt) throw new BanAlreadyLiftedError(banId);
    const madrasahId = await this.madrasahOf(ban);
    if (!madrasahId) {
      throw new BanPermanentRequestInvalidError(
        banId,
        "Only a ban in a medrese's course, or over the medrese, can be made permanent by the medrese"
      );
    }
    if (ban.bannedTier >= BAN_TIERS.PLATFORM) {
      throw new BanPermanentRequestInvalidError(
        banId,
        "A ban placed by Medaris administration needs no request"
      );
    }

    const standing = await this.standingFor(user, ban, MADRASAH_WIDE_ROLES);
    if (!standing) {
      throw new BanForbiddenError(
        "Only a medrese nazır or above may ask for a permanent ban"
      );
    }
    const created = await this.repo.requestPermanent({
      banId,
      reason: dto.reason.trim(),
      requestedBy: user.sub,
      role: standing.role,
    });
    if (!created) throw new BanPermanentRequestExistsError(banId);
    return this.madrasahView(banId, user, madrasahId);
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

  private async madrasahView(
    banId: string,
    user: AuthenticatedUser,
    madrasahId: string
  ): Promise<IMadrasahBanView> {
    const [entry, widened, held] = await Promise.all([
      this.repo.findEntry(banId),
      this.repo.openMadrasahBanUsers(madrasahId),
      this.repo.rolesOf(user.sub),
    ]);
    if (!entry) throw new BanNotFoundError(banId);
    return this.annotateMadrasah(
      entry,
      madrasahId,
      held,
      this.authz.isSystemAdmin(user),
      widened
    );
  }

  /**
   * The medrese list's version of `annotate`: the caller's kademe is looked up
   * per row, over the roles they hold, since a ban's course and köşk differ
   * from row to row.
   */
  private annotateMadrasah(
    entry: IBanEntry,
    madrasahId: string,
    held: readonly IHeldAssignment[],
    admin: boolean,
    widened: Set<string>
  ): IMadrasahBanView {
    const scopes = {
      koskId: entry.koskId,
      courseId: entry.courseId,
      madrasahId,
    };
    const tier = (allowed: readonly BanRole[]): BanTier | null => {
      const role = admin
        ? SYSTEM_ADMIN_ROLE
        : standingAmong(held, scopes, allowed);
      return role ? tierOfRole(role) : null;
    };
    const isOpen = entry.liftedAt === null;
    const actsForMadrasah = tier(MADRASAH_WIDE_ROLES) !== null;
    const lifter = tier(MAY_MODERATE_ROLES);
    return {
      ...entry,
      viewerMayLift:
        isOpen && lifter !== null && mayLift(lifter, entry.bannedTier),
      viewerMayEscalate:
        isOpen &&
        entry.scope === BAN_SCOPES.COURSE &&
        actsForMadrasah &&
        !widened.has(entry.userId),
      viewerMayRequestPermanent:
        isOpen &&
        entry.bannedTier < BAN_TIERS.PLATFORM &&
        entry.permanentRequestedAt === null &&
        actsForMadrasah,
    };
  }

  /** The medrese a ban belongs to: its own, or that of the course it bars; null for a köşk's. */
  private async madrasahOf(ban: IBan): Promise<string | null> {
    if (ban.madrasahId) return ban.madrasahId;
    if (!ban.courseId) return null;
    return (await this.repo.findCourse(ban.courseId))?.madrasahId ?? null;
  }

  /** The caller's highest standing where the ban sits, among the roles given. */
  private async standingFor(
    user: AuthenticatedUser,
    ban: IBan,
    allowed: readonly BanRole[] = MAY_MODERATE_ROLES
  ): Promise<IStanding | null> {
    return this.standing(
      user,
      {
        koskId: ban.koskId,
        courseId: ban.courseId,
        madrasahId: await this.madrasahOf(ban),
      },
      allowed
    );
  }

  private async standing(
    user: AuthenticatedUser,
    scopes: IBanScopes,
    allowed: readonly BanRole[] = MAY_BAN_ROLES
  ): Promise<IStanding | null> {
    if (this.authz.isSystemAdmin(user)) {
      return { role: SYSTEM_ADMIN_ROLE, tier: tierOfRole(SYSTEM_ADMIN_ROLE) };
    }
    const held = await this.repo.rolesHeld(user.sub, scopes);
    // Only the roles that may moderate count: a medrese nazır's higher kademe
    // must not hide the müderris role the same person also holds.
    const role = highestRole(
      held.filter((r) => allowed.includes(r)).map((r) => ({ role: r }))
    );
    return role ? { role, tier: tierOfRole(role) } : null;
  }
}
