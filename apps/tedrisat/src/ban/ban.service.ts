import { AuthenticatedUser, type PermissionCode } from "@medaris/common";
import { Injectable, Logger } from "@nestjs/common";
import { CourseNotFoundError } from "../course/errors/course-not-found.error";
import { BAN_SCOPES, type BanScope } from "../database/schema/ban.schema";
import { KoskNotFoundError } from "../kosk/errors/kosk-not-found.error";
import { KoskService } from "../kosk/kosk.service";
import { NotificationService } from "../notification/notification.service";
import {
  BanRepository,
  type IBan,
  type IBanEntry,
  type IBanFilter,
} from "./ban.repository";
import {
  BanAuthority,
  coursePlace,
  type IBanHoldings,
  type IBanPlace,
  koskPlace,
  madrasahPlace,
  PLATFORM_PLACE,
  placeOfBan,
} from "./ban-authority";
import {
  IMPOSE_CODES,
  LIFT_CODES,
  PERMANENT_REQUEST_CODES,
  READ_ALL_BANS_CODES,
  READ_KOSK_BANS_CODES,
} from "./ban-codes";
import {
  BAN_TIERS,
  type IBanScopes,
  mayLift,
  RUNS_COURSE_ROLES,
  RUNS_MADRASAH_ROLES,
} from "./ban-tier";
import type {
  BanStatus,
  CreateBanDto,
  ExtendBanDto,
  LiftBanDto,
} from "./dto/ban.dto";
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

export interface IAllBansList extends IBanList {
  total: number;
}

/** Who a widened ban belongs to: one person in one köşk. */
const widenedKey = (e: Pick<IBanEntry, "userId" | "koskId">) =>
  `${e.userId}:${e.koskId}`;

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

/**
 * Bans (MDRS-177, screens nizam/41 and nizam/42): a talebe barred from a
 * course or a whole köşk, lifted again with a reason.
 *
 * Authorization is here, not in `@Authz`: the engine has no ban entity, and
 * what a route asks depends on the ban in hand (its scope and where it sits).
 * Since MDRS-205 every decision is the catalogue's (`ban-codes.ts`, asked of the
 * engine by `BanAuthority`); the kademe (`ban-tier.ts`) only orders who may lift
 * whom, by the rank of the highest role that confers the permission used.
 * SYSTEM_ADMIN bypasses the catalogue and is the top of the ladder.
 */
@Injectable()
export class BanService {
  private readonly logger = new Logger(BanService.name);

  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: BanRepository,
    private readonly koskService: KoskService,
    private readonly notifications: NotificationService,
    private readonly authority: BanAuthority
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

    const scope = dto.scope as BanScope;
    const held = await this.authority.holdingsOf(user);
    const standing = this.authority.standing(
      held,
      scope === BAN_SCOPES.KOSK
        ? koskPlace(course.koskId)
        : coursePlace(course),
      IMPOSE_CODES[scope]
    );
    if (!standing) {
      throw new BanForbiddenError(
        scope === BAN_SCOPES.KOSK
          ? "You may not bar a talebe from the whole köşk"
          : "You may not bar talebe from this course",
        { permission: [...IMPOSE_CODES[scope]] }
      );
    }
    if (dto.userId === user.sub) {
      throw new BanTargetInvalidError("You cannot bar yourself");
    }
    const targetRoles = await this.repo.rolesHeld(dto.userId, scopes);
    const protectedRoles = course.madrasahId
      ? RUNS_MADRASAH_ROLES
      : RUNS_COURSE_ROLES;
    if (targetRoles.some((r) => protectedRoles.includes(r))) {
      throw new BanTargetInvalidError(
        "Someone who runs this course cannot be barred from it"
      );
    }

    const { ban, created } = await this.repo.create({
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
    if (created) {
      await this.announce(ban.id, user.sub);
      await this.tellBarred(ban.id);
    }
    return this.view(ban.id, held, new Set());
  }

  /**
   * A köşk's bans for those the catalogue lets read them (`ban.manage_kosk`,
   * `platform.ban_scoped`, `platform.ban_account`), with the counts the tabs show.
   */
  async listForKosk(
    user: AuthenticatedUser,
    koskId: string,
    status: BanStatus
  ): Promise<IBanList> {
    if (!(await this.koskService.exists(koskId))) {
      throw new KoskNotFoundError(koskId);
    }
    const held = await this.authority.holdingsOf(user);
    if (
      !this.authority.standing(held, koskPlace(koskId), READ_KOSK_BANS_CODES)
    ) {
      throw new BanForbiddenError("You may not see this köşk's bans", {
        permission: [...READ_KOSK_BANS_CODES],
      });
    }
    const [entries, counts, open] = await Promise.all([
      this.repo.listByKosk(koskId, status),
      this.repo.counts(koskId, new Date(Date.now() - RECENT_MS)),
      status === "ACTIVE" ? undefined : this.repo.listByKosk(koskId, "ACTIVE"),
    ]);
    const widened = new Set(
      (open ?? entries)
        .filter((e) => e.scope === BAN_SCOPES.KOSK)
        .map(widenedKey)
    );
    return {
      items: entries.map((e) => this.annotate(e, held, widened)),
      activeCount: counts.active,
      liftedCount: counts.lifted,
      recentCount: counts.recent,
    };
  }

  /**
   * Every köşk's bans for Medaris administration (MDRS-178, screen nizam/48):
   * the başnazım and a Medaris nazımı holding `platform.ban_scoped` or
   * `platform.ban_account`. Counts are platform-wide, whatever the filter.
   */
  async listAll(
    user: AuthenticatedUser,
    filter: IBanFilter
  ): Promise<IAllBansList> {
    const held = await this.authority.holdingsOf(user);
    if (!this.authority.standing(held, PLATFORM_PLACE, READ_ALL_BANS_CODES)) {
      throw new BanForbiddenError("Only Medaris administration sees all bans", {
        permission: [...READ_ALL_BANS_CODES],
      });
    }
    const [{ items, total }, counts, open] = await Promise.all([
      this.repo.listAll(filter),
      this.repo.counts(null, new Date(Date.now() - RECENT_MS)),
      filter.status === "ACTIVE"
        ? undefined
        : this.repo.listAll({
            status: "ACTIVE",
            scope: BAN_SCOPES.KOSK,
            limit: 1000,
            offset: 0,
          }),
    ]);
    const widened = new Set(
      (open?.items ?? items)
        .filter((e) => e.scope === BAN_SCOPES.KOSK)
        .map(widenedKey)
    );
    return {
      items: items.map((e) => this.annotate(e, held, widened)),
      total,
      activeCount: counts.active,
      liftedCount: counts.lifted,
      recentCount: counts.recent,
    };
  }

  /**
   * Moves a course ban up to the whole köşk (MDRS-178, "Yasağı genişlet" and
   * "Köşkten de yasakla"): a new KOSK ban for the same person with its own
   * reason, the course ban left standing. Whoever may bar from the whole köşk
   * may (`ban.manage_kosk`, `platform.ban_scoped`).
   */
  async extend(
    user: AuthenticatedUser,
    banId: string,
    dto: ExtendBanDto
  ): Promise<IBanView> {
    const ban = await this.repo.findById(banId);
    if (!ban) throw new BanNotFoundError(banId);
    if (ban.liftedAt) throw new BanAlreadyLiftedError(banId);
    if (ban.scope !== BAN_SCOPES.COURSE) {
      throw new BanTargetInvalidError("Only a course ban can be widened");
    }
    const held = await this.authority.holdingsOf(user);
    const standing = ban.koskId
      ? this.authority.standing(
          held,
          koskPlace(ban.koskId),
          IMPOSE_CODES[BAN_SCOPES.KOSK]
        )
      : null;
    if (!standing) {
      throw new BanForbiddenError("You may not widen a ban to the whole köşk", {
        permission: [...IMPOSE_CODES[BAN_SCOPES.KOSK]],
      });
    }
    const { ban: widened, created } = await this.repo.create({
      userId: ban.userId,
      koskId: ban.koskId,
      courseId: null,
      madrasahId: null,
      scope: BAN_SCOPES.KOSK,
      extendedFromCourseId: ban.courseId,
      extendedFromBanId: ban.id,
      reason: dto.reason.trim(),
      bannedBy: user.sub,
      bannedRole: standing.role,
      bannedTier: standing.tier,
    });
    if (created) {
      await this.announce(widened.id, user.sub);
      await this.tellBarred(widened.id);
    }
    return this.view(widened.id, held, new Set());
  }

  /**
   * Lifts a ban with a reason. The caller needs the permission to ban at the
   * ban's level (`ban-codes.ts`), and their kademe must reach the one that
   * placed it: the level that placed it, or any level above.
   */
  async lift(
    user: AuthenticatedUser,
    banId: string,
    dto: LiftBanDto
  ): Promise<IBanView> {
    const ban = await this.repo.findById(banId);
    if (!ban) throw new BanNotFoundError(banId);
    if (ban.liftedAt) throw new BanAlreadyLiftedError(banId);

    const held = await this.authority.holdingsOf(user);
    const place = placeOfBan(ban, await this.madrasahOf(ban));
    const standing = place
      ? this.authority.standing(held, place, LIFT_CODES[ban.scope])
      : null;
    if (!standing || !mayLift(standing.tier, ban.bannedTier)) {
      throw new BanLiftForbiddenError(banId);
    }
    const lifted = await this.repo.lift(banId, {
      liftedBy: user.sub,
      liftReason: dto.reason.trim(),
      role: standing.role,
    });
    if (!lifted) throw new BanAlreadyLiftedError(banId);
    return this.view(banId, held, new Set());
  }

  /**
   * Tells the köşk's nazımları and the Medaris nazımları of a new ban
   * (MDRS-179), all but the one who placed it. A notification that cannot be
   * written never undoes the ban: the failure is logged and the ban stands.
   */
  private async announce(banId: string, actorId: string): Promise<void> {
    try {
      const entry = await this.repo.findEntry(banId);
      // A medrese-wide ban has no köşk whose nazımları could be told.
      if (!entry || entry.koskId === null) return;
      const recipients = (await this.repo.nazimRecipients(entry.koskId)).filter(
        (id) => id !== actorId
      );
      if (recipients.length === 0) return;
      const person = (p: { name: string | null; email: string | null }) =>
        p.name ?? p.email ?? "";
      const params = {
        source: entry.koskName ?? "",
        koskName: entry.koskName ?? "",
        courseTitle: entry.courseTitle ?? entry.extendedFromCourseTitle ?? "",
        talebeName: person(entry.user),
        actorName: person(entry.bannerPerson),
        reason: entry.reason,
      };
      await this.notifications.notify(
        ...recipients.map((userId) => ({
          userId,
          type:
            entry.scope === BAN_SCOPES.KOSK
              ? ("KOSK_BAN_PLACED" as const)
              : ("COURSE_BAN_PLACED" as const),
          targetType: "KOSK" as const,
          targetId: entry.koskId,
          params,
        }))
      );
    } catch (error) {
      this.logger.error(`Could not notify of ban ${banId}`, error);
    }
  }

  /**
   * Tells the talebe of each course a new ban has taken from them (MDRS-213).
   * They read what changed, "erişimin kaldırıldı", never "yasak"
   * (MDS-VOICE-05), and never the reason, which is for those who lift the ban.
   * A notification that cannot be written never undoes the ban.
   */
  private async tellBarred(banId: string): Promise<void> {
    try {
      const seats = await this.repo.seatsNewlyBarred(banId);
      if (seats.length === 0) return;
      await this.notifications.notify(
        ...seats.map((seat) => ({
          userId: seat.userId,
          type: "COURSE_ACCESS_REMOVED" as const,
          targetType: "COURSE" as const,
          targetId: seat.courseId,
          params: {
            courseTitle: seat.courseTitle,
            ...(seat.koskName ? { source: seat.koskName } : {}),
          },
        }))
      );
    } catch (error) {
      this.logger.error(`Could not tell the talebe of ban ${banId}`, error);
    }
  }

  /**
   * A medrese's bans for its nazırs (nazir/11), with the counts the tabs show
   * and, per row, what the caller's permissions and kademe let them do. The
   * controller has already authorized the caller against the medrese.
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
      this.authority.holdingsOf(user),
    ]);
    return {
      items: entries.map((e) =>
        this.annotateMadrasah(e, madrasahId, held, widened)
      ),
      activeCount: counts.active,
      liftedCount: counts.lifted,
      recentCount: counts.recent,
    };
  }

  /**
   * Bars a talebe from one of the medrese's courses or from the whole medrese
   * (nazir/10 and nazir/11 "Yasakla"); a second request for the same bar is the
   * first. A medrese-wide ban takes `madrasah.ban` (or `platform.ban_scoped`);
   * a ban from one course takes the course's own permission (`ban.course`),
   * which the başmüderris holds in its medrese's courses and a Medaris nazımı
   * holding only `platform.ban_scoped` does not. A medrese nazır's ban is the
   * medrese's kademe: a köşk nazımı lifts it, a course's müderris does not.
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

    const held = await this.authority.holdingsOf(user);
    const place: IBanPlace =
      scope === BAN_SCOPES.MADRASAH || !course
        ? madrasahPlace(madrasahId)
        : coursePlace(course);
    const standing = this.authority.standing(held, place, IMPOSE_CODES[scope]);
    if (!standing) {
      throw new BanForbiddenError(
        scope === BAN_SCOPES.MADRASAH
          ? "You may not bar a talebe from the whole medrese"
          : "You may not bar talebe from this course",
        { permission: [...IMPOSE_CODES[scope]] }
      );
    }
    if (dto.userId === user.sub) {
      throw new BanTargetInvalidError("You cannot bar yourself");
    }
    const targetRoles = await this.repo.rolesHeld(dto.userId, scopes);
    if (targetRoles.some((r) => RUNS_MADRASAH_ROLES.includes(r))) {
      throw new BanTargetInvalidError(
        "Someone who runs this medrese or course cannot be barred from it"
      );
    }

    const { ban, created } = await this.repo.create({
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
    if (created) await this.tellBarred(ban.id);
    return this.madrasahView(ban.id, held, madrasahId);
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

    const held = await this.authority.holdingsOf(user);
    const standing = this.authority.standing(
      held,
      madrasahPlace(madrasahId),
      IMPOSE_CODES[BAN_SCOPES.MADRASAH]
    );
    if (!standing) {
      throw new BanForbiddenError("You may not widen a ban to the medrese", {
        permission: [...IMPOSE_CODES[BAN_SCOPES.MADRASAH]],
      });
    }
    const { ban: wide, created } = await this.repo.create({
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
    if (created) await this.tellBarred(wide.id);
    return this.madrasahView(wide.id, held, madrasahId);
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

    const held = await this.authority.holdingsOf(user);
    const standing = this.authority.standing(
      held,
      madrasahPlace(madrasahId),
      PERMANENT_REQUEST_CODES
    );
    if (!standing) {
      throw new BanForbiddenError("You may not ask for a permanent ban", {
        permission: [...PERMANENT_REQUEST_CODES],
      });
    }
    const created = await this.repo.requestPermanent({
      banId,
      reason: dto.reason.trim(),
      requestedBy: user.sub,
      role: standing.role,
    });
    if (!created) throw new BanPermanentRequestExistsError(banId);
    return this.madrasahView(banId, held, madrasahId);
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
    held: IBanHoldings,
    widened: Set<string>
  ): Promise<IBanView> {
    const entry = await this.repo.findEntry(banId);
    if (!entry) throw new BanNotFoundError(banId);
    return this.annotate(entry, held, widened);
  }

  /** What the caller may do to an open ban, from what they hold at the place it sits. */
  private mayLiftEntry(entry: IBanEntry, held: IBanHoldings): boolean {
    if (entry.liftedAt !== null) return false;
    const place = placeOfBan(entry, entry.placeMadrasahId);
    const standing = place
      ? this.authority.standing(held, place, LIFT_CODES[entry.scope])
      : null;
    return standing !== null && mayLift(standing.tier, entry.bannedTier);
  }

  private annotate(
    entry: IBanEntry,
    held: IBanHoldings,
    widened: Set<string>
  ): IBanView {
    const isOpen = entry.liftedAt === null;
    return {
      ...entry,
      viewerMayLift: this.mayLiftEntry(entry, held),
      viewerMayExtend:
        isOpen &&
        entry.scope === BAN_SCOPES.COURSE &&
        entry.koskId !== null &&
        !widened.has(widenedKey(entry)) &&
        this.authority.standing(
          held,
          koskPlace(entry.koskId),
          IMPOSE_CODES[BAN_SCOPES.KOSK]
        ) !== null,
    };
  }

  private async madrasahView(
    banId: string,
    held: IBanHoldings,
    madrasahId: string
  ): Promise<IMadrasahBanView> {
    const [entry, widened] = await Promise.all([
      this.repo.findEntry(banId),
      this.repo.openMadrasahBanUsers(madrasahId),
    ]);
    if (!entry) throw new BanNotFoundError(banId);
    return this.annotateMadrasah(entry, madrasahId, held, widened);
  }

  /**
   * The medrese list's version of `annotate`: each action is asked of the
   * catalogue for the row, over what the caller holds, so a nazır given only
   * `madrasah.ban` sees a medrese-wide ban liftable and a course ban not.
   */
  private annotateMadrasah(
    entry: IBanEntry,
    madrasahId: string,
    held: IBanHoldings,
    widened: Set<string>
  ): IMadrasahBanView {
    const isOpen = entry.liftedAt === null;
    const at = (codes: readonly PermissionCode[]) =>
      this.authority.standing(held, madrasahPlace(madrasahId), codes) !== null;
    return {
      ...entry,
      viewerMayLift: this.mayLiftEntry(entry, held),
      viewerMayEscalate:
        isOpen &&
        entry.scope === BAN_SCOPES.COURSE &&
        at(IMPOSE_CODES[BAN_SCOPES.MADRASAH]) &&
        !widened.has(entry.userId),
      viewerMayRequestPermanent:
        isOpen &&
        entry.bannedTier < BAN_TIERS.PLATFORM &&
        entry.permanentRequestedAt === null &&
        at(PERMANENT_REQUEST_CODES),
    };
  }

  /** The medrese a ban belongs to: its own, or that of the course it bars; null for a köşk's. */
  private async madrasahOf(ban: IBan): Promise<string | null> {
    if (ban.madrasahId) return ban.madrasahId;
    if (!ban.courseId) return null;
    return (await this.repo.findCourse(ban.courseId))?.madrasahId ?? null;
  }
}
