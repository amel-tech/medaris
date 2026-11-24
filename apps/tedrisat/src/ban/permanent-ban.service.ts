import { AuthenticatedUser } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { ASSIGNED_ROLES } from "../database/schema/role-assignment.schema";
import { BanRepository } from "./ban.repository";
import { BanService } from "./ban.service";
import {
  BanAuthority,
  type IBanStanding,
  PLATFORM_PLACE,
} from "./ban-authority";
import { DECIDE_PERMANENT_CODES } from "./ban-codes";
import type {
  PermanentBanRequestListResponse,
  PermanentBanRequestResponse,
  PermanentBanTab,
} from "./dto/permanent-ban.dto";
import {
  BanAlreadyLiftedError,
  BanForbiddenError,
  BanNotFoundError,
  BanTargetInvalidError,
  PermanentBanRequestNotFoundError,
  PermanentBanRequestNotPendingError,
} from "./errors/ban-errors";
import {
  type IPermanentBanRequestEntry,
  PermanentBanRepository,
} from "./permanent-ban.repository";

const LIST_LIMIT = 100;

const person = (p: {
  id: string;
  name: string | null;
  email: string | null;
}) => ({ id: p.id, name: p.name, email: p.email });

/** A request as the API sends it; one whose ban row is gone is left out of the lists. */
const present = (
  r: IPermanentBanRequestEntry & {
    ban: NonNullable<IPermanentBanRequestEntry["ban"]>;
  }
): PermanentBanRequestResponse => ({
  id: r.id,
  status: r.status,
  reason: r.reason,
  requestedBy: person(r.requestedBy),
  createdAt: r.createdAt,
  decidedBy: r.decidedBy ? person(r.decidedBy) : null,
  decidedAt: r.decidedAt,
  decisionNote: r.decisionNote,
  platformBanId: r.platformBanId,
  ban: {
    id: r.ban.id,
    user: person(r.ban.user),
    scope: r.ban.scope,
    koskName: r.ban.koskName,
    courseTitle: r.ban.courseTitle,
    madrasahName: r.ban.madrasahName,
    reason: r.ban.reason,
    bannedBy: person(r.ban.bannerPerson),
    bannedRole: r.ban.bannedRole,
    createdAt: r.ban.createdAt,
    liftedAt: r.ban.liftedAt,
  },
});

/**
 * Kalıcı yasak talepleri (MDRS-194, nizam/45): Medaris administration decides
 * the requests a medrese opened for a ban to be made permanent (MDRS-187).
 * The başnazım, or a Medaris nazımı holding `platform.ban_account`, reads and
 * decides them; everyone else is a 403 (BAN_FORBIDDEN).
 *
 * Approving bars the person from all of Medaris: a PLATFORM ban, which every
 * check that reads bans refuses in every köşk, medrese and course. The lower
 * ban stays beside it. Nothing is done to the sign-in account: closing it
 * needs an identity-provider client this service does not have (MDRS-197).
 * Refusing leaves the lower ban as it was and keeps a note for whoever asked.
 */
@Injectable()
export class PermanentBanService {
  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: PermanentBanRepository,
    private readonly banRepo: BanRepository,
    private readonly bans: BanService,
    private readonly authority: BanAuthority
  ) {}

  private async standing(user: AuthenticatedUser): Promise<IBanStanding> {
    const held = await this.authority.holdingsOf(user);
    const standing = this.authority.standing(
      held,
      PLATFORM_PLACE,
      DECIDE_PERMANENT_CODES
    );
    if (!standing) {
      throw new BanForbiddenError(
        "Only Medaris administration decides permanent ban requests",
        { permission: [...DECIDE_PERMANENT_CODES] }
      );
    }
    return standing;
  }

  async list(
    user: AuthenticatedUser,
    tab: PermanentBanTab
  ): Promise<PermanentBanRequestListResponse> {
    await this.standing(user);
    const [entries, counts] = await Promise.all([
      this.repo.list(tab, LIST_LIMIT),
      this.repo.counts(),
    ]);
    return {
      items: entries.flatMap((e) =>
        e.ban ? [present({ ...e, ban: e.ban })] : []
      ),
      pendingCount: counts.pending,
      decidedCount: counts.decided,
    };
  }

  /** How many requests wait, for the home page's number; no authorization of its own. */
  async pendingCount(): Promise<number> {
    return (await this.repo.counts()).pending;
  }

  private async pending(id: string): Promise<IPermanentBanRequestEntry> {
    const request = await this.repo.find(id);
    if (!request) throw new PermanentBanRequestNotFoundError(id);
    if (request.status !== "PENDING") {
      throw new PermanentBanRequestNotPendingError(id);
    }
    return request;
  }

  /** "Onayla": the person is barred from all of Medaris. */
  async approve(user: AuthenticatedUser, id: string): Promise<void> {
    const standing = await this.standing(user);
    const request = await this.pending(id);
    const ban = request.ban;
    if (!ban) throw new BanNotFoundError(request.banId);
    // A ban its own kademe lifted is no ground for a wider one: such a
    // request is refused, with the reason written down.
    if (ban.liftedAt) throw new BanAlreadyLiftedError(ban.id);
    if (ban.userId === user.sub) {
      throw new BanTargetInvalidError("You cannot bar yourself");
    }
    const platformRoles = await this.banRepo.rolesHeld(ban.userId, {
      koskId: null,
      courseId: null,
      madrasahId: null,
    });
    if (platformRoles.includes(ASSIGNED_ROLES.MEDARIS_NAZIM)) {
      throw new BanTargetInvalidError(
        "A Medaris nazımı cannot be barred from the platform"
      );
    }
    const approved = await this.repo.approve({
      request,
      ban,
      actorId: user.sub,
      role: standing.role,
    });
    if (!approved) throw new PermanentBanRequestNotPendingError(id);
    if (approved.created) await this.bans.tellBarred(approved.platformBan.id);
  }

  /** "Reddet": the note is required; the lower ban stays as it was. */
  async reject(
    user: AuthenticatedUser,
    id: string,
    note: string
  ): Promise<void> {
    const standing = await this.standing(user);
    const request = await this.pending(id);
    const rejected = await this.repo.reject({
      request,
      userId: request.ban?.userId ?? null,
      actorId: user.sub,
      role: standing.role,
      note: note.trim(),
    });
    if (!rejected) throw new PermanentBanRequestNotPendingError(id);
  }
}
