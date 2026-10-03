import { Injectable } from "@nestjs/common";
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  not,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { isHeld } from "../database/role-assignments";
import { auditLog } from "../database/schema/audit.schema";
import { courses } from "../database/schema/course.schema";
import { kosks } from "../database/schema/kosk.schema";
import { madrasahs } from "../database/schema/madrasah.schema";
import { roleAssignments } from "../database/schema/role-assignment.schema";
import { users } from "../database/schema/user.schema";
import {
  AUDIT_OTHER,
  AUDIT_TYPE_RULES,
  type AuditScopeKind,
  type AuditType,
  auditTypeRule,
} from "./audit-types";

/** What an `audit_log` row may be written with. */
export interface IAuditEntry {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  details?: Record<string, unknown>;
}

export interface IAuditFilter {
  /** a name or e-mail fragment, or a user id */
  actor?: string;
  type?: AuditType;
  scope?: AuditScopeKind;
  from?: Date;
  to?: Date;
}

export interface IAuditCursor {
  /** `created_at` as the database printed it, so no precision is lost */
  createdAt: string;
  id: string;
}

export interface IAuditRow {
  id: string;
  number: number;
  /** the database's own text of the timestamp, for the cursor */
  createdAtText: string;
  createdAt: Date;
  actorId: string;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string;
  details: Record<string, unknown>;
  scopeKind: AuditScopeKind;
  scopeId: string | null;
  scopeName: string | null;
}

const UUID_RE =
  "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";
const UUID_TEXT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A uuid kept in `details` under `key`, or null: details are free-form, so the cast is guarded. */
const detailUuid = (key: string): SQL<string | null> =>
  sql<
    string | null
  >`(case when ${auditLog.details}->>${key} ~* ${UUID_RE} then (${auditLog.details}->>${key})::uuid end)`;

const ROLE_ORDER = [
  "MEDARIS_NAZIM",
  "KOSK_NAZIM",
  "MEDRESE_BASMUDERRIS",
  "MEDRESE_NAZIR",
  "MUDERRIS",
  "DERS_NAZIR",
] as const;

/** The audit trail: appended to by every module, read by nizam/17. Nothing here updates or deletes a row. */
@Injectable()
export class AuditRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  async insert(entry: IAuditEntry): Promise<void> {
    await this.db.insert(auditLog).values({
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      details: entry.details ?? {},
    });
  }

  // The row's köşk: the köşk itself, a `koskId` it names, or the köşk of the
  // course it is about. Its medrese: the medrese itself or a `madrasahId` it
  // names. Anything else is the platform's.
  private readonly courseOf = sql<
    string | null
  >`(case when ${auditLog.entity} = 'course' then ${auditLog.entityId} else ${detailUuid("courseId")} end)`;
  private readonly koskOf = sql<
    string | null
  >`coalesce((case when ${auditLog.entity} = 'kosk' then ${auditLog.entityId} end), ${detailUuid("koskId")}, ${courses.koskId})`;
  private readonly madrasahOf = sql<
    string | null
  >`coalesce((case when ${auditLog.entity} = 'madrasah' then ${auditLog.entityId} end), ${detailUuid("madrasahId")})`;

  private typeCondition(type: AuditType): SQL | undefined {
    if (type === AUDIT_OTHER) {
      const known = (
        Object.keys(AUDIT_TYPE_RULES) as Exclude<AuditType, "OTHER">[]
      ).map((t) => this.typeCondition(t) as SQL);
      return not(or(...known) as SQL);
    }
    const { like, unless } = auditTypeRule(type);
    const matches = or(...like.map((p) => sql`${auditLog.action} like ${p}`));
    return unless.length > 0
      ? and(matches, not(inArray(auditLog.action, [...unless])))
      : matches;
  }

  private conditions(filter: IAuditFilter, cursor?: IAuditCursor): SQL[] {
    const where: SQL[] = [];
    if (filter.actor) {
      const needle = `%${filter.actor.replace(/[\\%_]/g, "\\$&")}%`;
      where.push(
        UUID_TEXT.test(filter.actor)
          ? eq(auditLog.actorId, filter.actor)
          : (or(
              ilike(users.givenName, needle),
              ilike(users.familyName, needle),
              ilike(users.email, needle),
              ilike(
                sql`concat_ws(' ', ${users.givenName}, ${users.familyName})`,
                needle
              )
            ) as SQL)
      );
    }
    if (filter.type) {
      const condition = this.typeCondition(filter.type);
      if (condition) where.push(condition);
    }
    if (filter.scope === "KOSK") where.push(sql`${this.koskOf} is not null`);
    if (filter.scope === "MADRASAH") {
      where.push(
        sql`${this.koskOf} is null and ${this.madrasahOf} is not null`
      );
    }
    if (filter.scope === "PLATFORM") {
      where.push(sql`${this.koskOf} is null and ${this.madrasahOf} is null`);
    }
    if (filter.from) where.push(gte(auditLog.createdAt, filter.from));
    if (filter.to) where.push(lte(auditLog.createdAt, filter.to));
    if (cursor) {
      where.push(
        sql`(${auditLog.createdAt}, ${auditLog.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
      );
    }
    return where;
  }

  /** Newest first. Fetches one more than `limit` so the caller can tell whether a page follows. */
  async list(
    filter: IAuditFilter,
    cursor: IAuditCursor | undefined,
    limit: number
  ): Promise<IAuditRow[]> {
    const rows = await this.db
      .select({
        id: auditLog.id,
        number: auditLog.seq,
        createdAtText: sql<string>`${auditLog.createdAt}::text`,
        createdAt: auditLog.createdAt,
        actorId: auditLog.actorId,
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
        action: auditLog.action,
        entity: auditLog.entity,
        entityId: auditLog.entityId,
        details: auditLog.details,
        koskId: this.koskOf,
        koskName: kosks.name,
        madrasahId: this.madrasahOf,
        madrasahName: madrasahs.name,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .leftJoin(courses, sql`${courses.id} = ${this.courseOf}`)
      .leftJoin(kosks, sql`${kosks.id} = ${this.koskOf}`)
      .leftJoin(madrasahs, sql`${madrasahs.id} = ${this.madrasahOf}`)
      .where(and(...this.conditions(filter, cursor)))
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(limit);
    return rows.map((r) => {
      const scopeKind: AuditScopeKind = r.koskId
        ? "KOSK"
        : r.madrasahId
          ? "MADRASAH"
          : "PLATFORM";
      return {
        id: r.id,
        number: Number(r.number ?? 0),
        createdAtText: r.createdAtText,
        createdAt: r.createdAt,
        actorId: r.actorId,
        actorName:
          [r.givenName, r.familyName].filter(Boolean).join(" ").trim() ||
          r.email ||
          null,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        details: r.details,
        scopeKind,
        scopeId:
          scopeKind === "KOSK"
            ? r.koskId
            : scopeKind === "MADRASAH"
              ? r.madrasahId
              : null,
        scopeName:
          scopeKind === "KOSK"
            ? r.koskName
            : scopeKind === "MADRASAH"
              ? r.madrasahName
              : null,
      };
    });
  }

  /** The widest role each of the people holds right now; SYSTEM_ADMIN lives in the realm, not here. */
  async rolesOf(userIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (userIds.length === 0) return result;
    const rows = await this.db
      .selectDistinct({
        userId: roleAssignments.userId,
        role: roleAssignments.role,
      })
      .from(roleAssignments)
      .where(and(inArray(roleAssignments.userId, userIds), isHeld()));
    for (const id of userIds) {
      const held = new Set(
        rows.filter((r) => r.userId === id).map((r) => r.role)
      );
      const best = ROLE_ORDER.find((role) => held.has(role));
      if (best) result.set(id, best);
    }
    return result;
  }
}
