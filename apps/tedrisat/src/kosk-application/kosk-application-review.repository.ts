import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { isHeld } from "../database/role-assignments";
import { auditLog } from "../database/schema/audit.schema";
import { kosks } from "../database/schema/kosk.schema";
import { koskApplications } from "../database/schema/kosk-application.schema";
import { roleAssignments } from "../database/schema/role-assignment.schema";
import { users } from "../database/schema/user.schema";

export interface IApplicationRow {
  id: string;
  name: string;
  field: string;
  summary: string;
  reason: string;
  email: string;
  phone: string | null;
  status: string;
  createdAt: Date;
  decidedAt: Date | null;
  rejectReason: string | null;
  koskId: string | null;
  applicantId: string;
  applicantName: string | null;
}

export interface IApplicationCounts {
  pending: number;
  decided: number;
}

const nameOf = (
  given: string | null,
  family: string | null,
  email: string | null
): string | null =>
  [given, family].filter(Boolean).join(" ").trim() || email || null;

@Injectable()
export class KoskApplicationReviewRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  private readonly columns = {
    id: koskApplications.id,
    name: koskApplications.name,
    field: koskApplications.field,
    summary: koskApplications.summary,
    reason: koskApplications.reason,
    email: koskApplications.email,
    phone: koskApplications.phone,
    status: koskApplications.status,
    createdAt: koskApplications.createdAt,
    decidedAt: koskApplications.decidedAt,
    rejectReason: koskApplications.rejectReason,
    koskId: koskApplications.koskId,
    applicantId: koskApplications.applicantId,
    givenName: users.givenName,
    familyName: users.familyName,
    accountEmail: users.email,
  };

  private toRow(r: {
    id: string;
    name: string;
    field: string;
    summary: string;
    reason: string;
    email: string;
    phone: string | null;
    status: string;
    createdAt: Date;
    decidedAt: Date | null;
    rejectReason: string | null;
    koskId: string | null;
    applicantId: string;
    givenName: string | null;
    familyName: string | null;
    accountEmail: string | null;
  }): IApplicationRow {
    return {
      id: r.id,
      name: r.name,
      field: r.field,
      summary: r.summary,
      reason: r.reason,
      email: r.email,
      phone: r.phone,
      status: r.status,
      createdAt: r.createdAt,
      decidedAt: r.decidedAt,
      rejectReason: r.rejectReason,
      koskId: r.koskId,
      applicantId: r.applicantId,
      applicantName: nameOf(r.givenName, r.familyName, null),
    };
  }

  /** Waiting ones oldest first, answered ones newest first. */
  async list(tab: "PENDING" | "DECIDED", limit: number) {
    const rows = await this.db
      .select(this.columns)
      .from(koskApplications)
      .leftJoin(users, eq(users.id, koskApplications.applicantId))
      .where(
        tab === "PENDING"
          ? eq(koskApplications.status, "PENDING")
          : ne(koskApplications.status, "PENDING")
      )
      .orderBy(
        tab === "PENDING"
          ? asc(koskApplications.createdAt)
          : desc(koskApplications.decidedAt),
        asc(koskApplications.id)
      )
      .limit(limit);
    return rows.map((r) => this.toRow(r));
  }

  async counts(): Promise<IApplicationCounts> {
    const [row] = await this.db
      .select({
        pending:
          sql<number>`count(*) filter (where ${koskApplications.status} = 'PENDING')`.mapWith(
            Number
          ),
        decided:
          sql<number>`count(*) filter (where ${koskApplications.status} <> 'PENDING')`.mapWith(
            Number
          ),
      })
      .from(koskApplications);
    return { pending: row?.pending ?? 0, decided: row?.decided ?? 0 };
  }

  async find(id: string): Promise<IApplicationRow | null> {
    const [row] = await this.db
      .select(this.columns)
      .from(koskApplications)
      .leftJoin(users, eq(users.id, koskApplications.applicantId))
      .where(eq(koskApplications.id, id));
    return row ? this.toRow(row) : null;
  }

  /** The roles the person holds now, as role names. */
  async rolesOf(userId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ role: roleAssignments.role })
      .from(roleAssignments)
      .where(and(eq(roleAssignments.userId, userId), isHeld()));
    return rows.map((r) => r.role);
  }

  /** Names of the shown köşks in a field, as the köşk form spells it. */
  async koskNamesInField(fieldLabel: string): Promise<string[]> {
    const rows = await this.db
      .select({ name: kosks.name })
      .from(kosks)
      .where(and(eq(kosks.field, fieldLabel), isNull(kosks.archivedAt)))
      .orderBy(kosks.name)
      .limit(20);
    return rows.map((r) => r.name);
  }

  async koskName(koskId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ name: kosks.name })
      .from(kosks)
      .where(eq(kosks.id, koskId));
    return row?.name ?? null;
  }

  /**
   * Answers a waiting application, once, and writes the audit row in the same
   * transaction. False when it was answered meanwhile.
   */
  async decide(input: {
    id: string;
    actorId: string;
    outcome: "APPROVED" | "REJECTED";
    rejectReason?: string;
    koskId?: string;
    applicantName: string;
    name: string;
  }): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(koskApplications)
        .set({
          status: input.outcome,
          decidedBy: input.actorId,
          decidedAt: sql`now()`,
          rejectReason: input.rejectReason ?? null,
          koskId: input.koskId ?? null,
        })
        .where(
          and(
            eq(koskApplications.id, input.id),
            eq(koskApplications.status, "PENDING")
          )
        )
        .returning({ id: koskApplications.id });
      if (updated.length === 0) return false;
      await tx.insert(auditLog).values({
        actorId: input.actorId,
        action:
          input.outcome === "APPROVED"
            ? "kosk_application.approve"
            : "kosk_application.reject",
        entity: "kosk_application",
        entityId: input.id,
        details: {
          name: input.name,
          ...(input.koskId ? { koskId: input.koskId } : {}),
          ...(input.rejectReason ? { reason: input.rejectReason } : {}),
        },
      });
      return true;
    });
  }

  /** The reviewer looked at the applicant's e-mail and phone: that is personal data. */
  async auditContactRead(
    actorId: string,
    application: { id: string; name: string; applicantId: string }
  ): Promise<void> {
    await this.db.insert(auditLog).values({
      actorId,
      action: "kosk_application.contact_read",
      entity: "kosk_application",
      entityId: application.id,
      details: { name: application.name, applicant: application.applicantId },
    });
  }
}
