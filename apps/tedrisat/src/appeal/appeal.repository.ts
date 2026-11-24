import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { appeals } from "../database/schema/appeal.schema";
import { auditLog } from "../database/schema/audit.schema";
import { courseRequests } from "../database/schema/course-request.schema";
import { kosks } from "../database/schema/kosk.schema";
import { madrasahs } from "../database/schema/madrasah.schema";
import { users } from "../database/schema/user.schema";
import { isUniqueViolation } from "../user/user-profile.repository";
import type {
  AppealResponse,
  AppealTab,
  MadrasahAppealRowResponse,
} from "./appeal.dto";

const nameOf = (
  given: string | null,
  family: string | null,
  email: string | null
): string | null =>
  [given, family].filter(Boolean).join(" ").trim() || email || null;

export interface IAppealedRequest {
  id: string;
  madrasahId: string;
  koskId: string;
  title: string;
  status: string;
}

@Injectable()
export class AppealRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** The medrese's refused requests and every request it appealed, newest first. */
  async madrasahRows(
    madrasahId: string,
    limit: number
  ): Promise<MadrasahAppealRowResponse[]> {
    const rows = await this.db
      .select({
        courseRequestId: courseRequests.id,
        title: courseRequests.title,
        koskId: kosks.id,
        koskName: kosks.name,
        requestStatus: courseRequests.status,
        rejectReason: courseRequests.rejectReason,
        appealId: appeals.id,
        appealStatus: appeals.status,
        appealReason: appeals.reason,
        decisionNote: appeals.decisionNote,
        appealCreatedAt: appeals.createdAt,
        appealDecidedAt: appeals.decidedAt,
      })
      .from(courseRequests)
      .innerJoin(kosks, eq(kosks.id, courseRequests.koskId))
      .leftJoin(appeals, eq(appeals.courseRequestId, courseRequests.id))
      .where(
        and(
          eq(courseRequests.madrasahId, madrasahId),
          or(eq(courseRequests.status, "REJECTED"), isNotNull(appeals.id))
        )
      )
      .orderBy(desc(courseRequests.createdAt), asc(courseRequests.id))
      .limit(limit);
    return rows.map((r) => ({
      courseRequestId: r.courseRequestId,
      title: r.title,
      kosk: { id: r.koskId, name: r.koskName },
      requestStatus: r.requestStatus,
      rejectReason: r.rejectReason,
      appeal: r.appealId
        ? {
            id: r.appealId,
            status: r.appealStatus ?? "PENDING",
            reason: r.appealReason ?? "",
            decisionNote: r.decisionNote,
            createdAt: r.appealCreatedAt ?? new Date(0),
            decidedAt: r.appealDecidedAt,
          }
        : null,
    }));
  }

  async findRequest(id: string): Promise<IAppealedRequest | null> {
    const [row] = await this.db
      .select({
        id: courseRequests.id,
        madrasahId: courseRequests.madrasahId,
        koskId: courseRequests.koskId,
        title: courseRequests.title,
        status: courseRequests.status,
      })
      .from(courseRequests)
      .where(eq(courseRequests.id, id));
    return row ?? null;
  }

  /** Writes the appeal and its audit row; null when the request already has one. */
  async create(input: {
    madrasahId: string;
    courseRequestId: string;
    reason: string;
    createdBy: string;
    title: string;
    koskId: string;
  }): Promise<string | null> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(appeals)
          .values({
            madrasahId: input.madrasahId,
            courseRequestId: input.courseRequestId,
            reason: input.reason,
            createdBy: input.createdBy,
          })
          .returning({ id: appeals.id });
        await tx.insert(auditLog).values({
          actorId: input.createdBy,
          action: "appeal.create",
          entity: "appeal",
          entityId: row.id,
          details: {
            courseRequestId: input.courseRequestId,
            title: input.title,
            madrasahId: input.madrasahId,
            koskId: input.koskId,
            reason: input.reason,
          },
        });
        return row.id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  private select() {
    return this.db
      .select({
        id: appeals.id,
        status: appeals.status,
        reason: appeals.reason,
        decisionNote: appeals.decisionNote,
        createdAt: appeals.createdAt,
        decidedAt: appeals.decidedAt,
        madrasahId: madrasahs.id,
        madrasahName: madrasahs.name,
        koskId: kosks.id,
        koskName: kosks.name,
        courseRequestId: courseRequests.id,
        title: courseRequests.title,
        rejectReason: courseRequests.rejectReason,
        createdBy: appeals.createdBy,
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
      })
      .from(appeals)
      .innerJoin(courseRequests, eq(courseRequests.id, appeals.courseRequestId))
      .innerJoin(madrasahs, eq(madrasahs.id, appeals.madrasahId))
      .innerJoin(kosks, eq(kosks.id, courseRequests.koskId))
      .leftJoin(users, eq(users.id, appeals.createdBy));
  }

  private toItem(
    r: Awaited<ReturnType<AppealRepository["select"]>>[number]
  ): AppealResponse {
    return {
      id: r.id,
      status: r.status,
      reason: r.reason,
      decisionNote: r.decisionNote,
      createdAt: r.createdAt,
      decidedAt: r.decidedAt,
      madrasah: { id: r.madrasahId, name: r.madrasahName },
      kosk: { id: r.koskId, name: r.koskName },
      courseRequestId: r.courseRequestId,
      title: r.title,
      rejectReason: r.rejectReason,
      createdBy: {
        id: r.createdBy,
        name: nameOf(r.givenName, r.familyName, r.email),
      },
    };
  }

  async list(tab: AppealTab, limit: number): Promise<AppealResponse[]> {
    const rows = await this.select()
      .where(
        tab === "PENDING"
          ? eq(appeals.status, "PENDING")
          : ne(appeals.status, "PENDING")
      )
      .orderBy(
        tab === "PENDING" ? asc(appeals.createdAt) : desc(appeals.decidedAt),
        asc(appeals.id)
      )
      .limit(limit);
    return rows.map((r) => this.toItem(r));
  }

  async counts(): Promise<{ pending: number; decided: number }> {
    const [row] = await this.db
      .select({
        pending:
          sql<number>`count(*) filter (where ${appeals.status} = 'PENDING')`.mapWith(
            Number
          ),
        decided:
          sql<number>`count(*) filter (where ${appeals.status} <> 'PENDING')`.mapWith(
            Number
          ),
      })
      .from(appeals);
    return { pending: row?.pending ?? 0, decided: row?.decided ?? 0 };
  }

  async find(id: string): Promise<AppealResponse | null> {
    const [row] = await this.select().where(eq(appeals.id, id));
    return row ? this.toItem(row) : null;
  }

  /**
   * Decides a waiting appeal, once, with its audit row in the same
   * transaction. Accepting puts the refused request back to PENDING, so the
   * köşk decides it again; the köşk's earlier reason stays on it until then.
   * False when the appeal was decided meanwhile.
   */
  async decide(input: {
    appeal: AppealResponse;
    actorId: string;
    outcome: "ACCEPTED" | "REJECTED";
    note: string | null;
  }): Promise<boolean> {
    const { appeal } = input;
    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(appeals)
        .set({
          status: input.outcome,
          decidedBy: input.actorId,
          decidedAt: sql`now()`,
          decisionNote: input.note,
        })
        .where(and(eq(appeals.id, appeal.id), eq(appeals.status, "PENDING")))
        .returning({ id: appeals.id });
      if (updated.length === 0) return false;
      if (input.outcome === "ACCEPTED") {
        await tx
          .update(courseRequests)
          .set({ status: "PENDING", decidedBy: null, decidedAt: null })
          .where(
            and(
              eq(courseRequests.id, appeal.courseRequestId),
              eq(courseRequests.status, "REJECTED")
            )
          );
      }
      await tx.insert(auditLog).values({
        actorId: input.actorId,
        action:
          input.outcome === "ACCEPTED" ? "appeal.accept" : "appeal.reject",
        entity: "appeal",
        entityId: appeal.id,
        details: {
          courseRequestId: appeal.courseRequestId,
          title: appeal.title,
          madrasahId: appeal.madrasah.id,
          koskId: appeal.kosk.id,
          ...(input.note ? { note: input.note } : {}),
        },
      });
      return true;
    });
  }
}
