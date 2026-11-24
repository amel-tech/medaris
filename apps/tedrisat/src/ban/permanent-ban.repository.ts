import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DatabaseService } from "../database/database.service";
import { auditLog } from "../database/schema/audit.schema";
import {
  BAN_SCOPES,
  banPermanentRequests,
  type PermanentBanRequestStatus,
} from "../database/schema/ban.schema";
import { users } from "../database/schema/user.schema";
import {
  BanRepository,
  type IBan,
  type IBanEntry,
  type IBanPerson,
} from "./ban.repository";
import { BAN_TIERS, type BanRole } from "./ban-tier";
import type { PermanentBanTab } from "./dto/permanent-ban.dto";

/** A request for a permanent ban, with the names its row stands for. */
export interface IPermanentBanRequest {
  id: string;
  banId: string;
  status: PermanentBanRequestStatus;
  reason: string;
  requestedBy: IBanPerson;
  createdAt: Date;
  decidedBy: IBanPerson | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  platformBanId: string | null;
}

/** A request with the ban it is about; the ban is null only if its row is gone. */
export interface IPermanentBanRequestEntry extends IPermanentBanRequest {
  ban: IBanEntry | null;
}

const fullName = (given: string | null, family: string | null) =>
  [given, family].filter(Boolean).join(" ").trim() || null;

/**
 * The requests for a permanent ban and Medaris administration's decisions on
 * them (MDRS-194, nizam/45). Opening a request is `BanRepository`'s, as it was
 * (MDRS-187); this reads them and decides them.
 */
@Injectable()
export class PermanentBanRepository {
  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly bans: BanRepository
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  private select() {
    const requester = alias(users, "permanent_requester");
    const decider = alias(users, "permanent_decider");
    return this.db
      .select({
        request: banPermanentRequests,
        requesterGiven: requester.givenName,
        requesterFamily: requester.familyName,
        requesterEmail: requester.email,
        deciderGiven: decider.givenName,
        deciderFamily: decider.familyName,
        deciderEmail: decider.email,
      })
      .from(banPermanentRequests)
      .leftJoin(requester, eq(requester.id, banPermanentRequests.requestedBy))
      .leftJoin(decider, eq(decider.id, banPermanentRequests.decidedBy));
  }

  private toRequest(
    r: Awaited<ReturnType<PermanentBanRepository["select"]>>[number]
  ): IPermanentBanRequest {
    const q = r.request;
    return {
      id: q.id,
      banId: q.banId,
      status: q.status as PermanentBanRequestStatus,
      reason: q.reason,
      requestedBy: {
        id: q.requestedBy,
        name: fullName(r.requesterGiven, r.requesterFamily),
        email: r.requesterEmail,
      },
      createdAt: q.createdAt,
      decidedBy: q.decidedBy
        ? {
            id: q.decidedBy,
            name: fullName(r.deciderGiven, r.deciderFamily),
            email: r.deciderEmail,
          }
        : null,
      decidedAt: q.decidedAt,
      decisionNote: q.decisionNote,
      platformBanId: q.platformBanId,
    };
  }

  private async withBans(
    requests: IPermanentBanRequest[]
  ): Promise<IPermanentBanRequestEntry[]> {
    const entries = await this.bans.entriesOf(requests.map((r) => r.banId));
    const byId = new Map(entries.map((e) => [e.id, e]));
    return requests.map((r) => ({ ...r, ban: byId.get(r.banId) ?? null }));
  }

  /** Waiting requests oldest first, decided ones newest first. */
  async list(
    tab: PermanentBanTab,
    limit: number
  ): Promise<IPermanentBanRequestEntry[]> {
    const rows = await this.select()
      .where(
        tab === "PENDING"
          ? eq(banPermanentRequests.status, "PENDING")
          : ne(banPermanentRequests.status, "PENDING")
      )
      .orderBy(
        tab === "PENDING"
          ? asc(banPermanentRequests.createdAt)
          : desc(banPermanentRequests.decidedAt),
        asc(banPermanentRequests.id)
      )
      .limit(limit);
    return this.withBans(rows.map((r) => this.toRequest(r)));
  }

  async counts(): Promise<{ pending: number; decided: number }> {
    const [row] = await this.db
      .select({
        pending:
          sql<number>`count(*) filter (where ${banPermanentRequests.status} = 'PENDING')`.mapWith(
            Number
          ),
        decided:
          sql<number>`count(*) filter (where ${banPermanentRequests.status} <> 'PENDING')`.mapWith(
            Number
          ),
      })
      .from(banPermanentRequests);
    return { pending: row?.pending ?? 0, decided: row?.decided ?? 0 };
  }

  async find(id: string): Promise<IPermanentBanRequestEntry | null> {
    const rows = await this.select().where(eq(banPermanentRequests.id, id));
    const [entry] = await this.withBans(rows.map((r) => this.toRequest(r)));
    return entry ?? null;
  }

  /**
   * Approves a waiting request, once: the PLATFORM ban for the person (or the
   * one that stands already), the request's decision and both audit rows, in
   * one transaction. Null when the request was decided meanwhile.
   */
  async approve(input: {
    request: IPermanentBanRequest;
    ban: IBan;
    actorId: string;
    role: BanRole;
  }): Promise<{ platformBan: IBan; created: boolean } | null> {
    const { request, ban } = input;
    return this.db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(banPermanentRequests)
        .set({
          status: "APPROVED",
          decidedBy: input.actorId,
          decidedAt: sql`now()`,
        })
        .where(
          and(
            eq(banPermanentRequests.id, request.id),
            eq(banPermanentRequests.status, "PENDING")
          )
        )
        .returning({ id: banPermanentRequests.id });
      if (!claimed) return null;
      const { ban: platformBan, created } = await this.bans.createWithin(tx, {
        userId: ban.userId,
        koskId: null,
        madrasahId: null,
        courseId: null,
        scope: BAN_SCOPES.PLATFORM,
        extendedFromCourseId: null,
        // The requester's case for barring the person everywhere is the
        // reason the platform ban stands on.
        reason: request.reason,
        bannedBy: input.actorId,
        bannedRole: input.role,
        bannedTier: BAN_TIERS.PLATFORM,
        permanentRequestId: request.id,
      });
      await tx
        .update(banPermanentRequests)
        .set({ platformBanId: platformBan.id })
        .where(eq(banPermanentRequests.id, request.id));
      await tx.insert(auditLog).values({
        actorId: input.actorId,
        action: "permanent_ban.approve",
        entity: "permanent_ban_request",
        entityId: request.id,
        details: {
          banId: ban.id,
          platformBanId: platformBan.id,
          userId: ban.userId,
          role: input.role,
        },
      });
      return { platformBan, created };
    });
  }

  /**
   * Refuses a waiting request, once, with its note and audit row in one
   * transaction; the ban it is about is not touched. False when the request
   * was decided meanwhile.
   */
  async reject(input: {
    request: IPermanentBanRequest;
    userId: string | null;
    actorId: string;
    role: BanRole;
    note: string;
  }): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(banPermanentRequests)
        .set({
          status: "REJECTED",
          decidedBy: input.actorId,
          decidedAt: sql`now()`,
          decisionNote: input.note,
        })
        .where(
          and(
            eq(banPermanentRequests.id, input.request.id),
            eq(banPermanentRequests.status, "PENDING")
          )
        )
        .returning({ id: banPermanentRequests.id });
      if (!claimed) return false;
      await tx.insert(auditLog).values({
        actorId: input.actorId,
        action: "permanent_ban.reject",
        entity: "permanent_ban_request",
        entityId: input.request.id,
        details: {
          banId: input.request.banId,
          userId: input.userId,
          role: input.role,
          note: input.note,
        },
      });
      return true;
    });
  }
}
