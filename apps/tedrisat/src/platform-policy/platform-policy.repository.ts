import { Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { auditLog } from "../database/schema/audit.schema";
import { kosks } from "../database/schema/kosk.schema";
import {
  PLATFORM_POLICY_KEYS,
  type PlatformPolicyKey,
  platformPolicies,
} from "../database/schema/platform-policy.schema";
import { users } from "../database/schema/user.schema";

export interface IPolicyRow {
  key: PlatformPolicyKey;
  enabled: boolean;
  changedBy: string | null;
  changedByName: string | null;
  changedAt: Date | null;
}

export interface IScopedPolicy {
  scopeId: string;
  scopeName: string;
  key: PlatformPolicyKey;
  openedBy: string | null;
  openedByName: string | null;
  openedAt: Date | null;
}

/** The action a köşk's own switch is recorded under, so the table can say who flipped it and when. */
export const KOSK_POLICY_ACTION = "kosk.policy_change";
export const PLATFORM_POLICY_ACTION = "platform_policy.change";
/** Platform-level rows have no entity of their own; this is the id they carry. */
export const PLATFORM_ENTITY_ID = "00000000-0000-0000-0000-000000000000";

const nameOf = (
  given: string | null,
  family: string | null,
  email: string | null
): string | null =>
  [given, family].filter(Boolean).join(" ").trim() || email || null;

/** The köşk columns each policy key mirrors. */
const KOSK_COLUMN = {
  ALWAYS_REQUIRE_APPROVAL: kosks.alwaysRequireApproval,
  RECORDINGS_NEVER_PUBLIC: kosks.recordingsNeverPublic,
} as const;

/** The key under which `kosk.policy_change` records the new value of each switch. */
const KOSK_DETAIL = {
  ALWAYS_REQUIRE_APPROVAL: "alwaysRequireApproval",
  RECORDINGS_NEVER_PUBLIC: "recordingsNeverPublic",
} as const;

@Injectable()
export class PlatformPolicyRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** The two switches, off for a key nobody has touched. */
  async all(): Promise<IPolicyRow[]> {
    const rows = await this.db
      .select({
        key: platformPolicies.key,
        enabled: platformPolicies.enabled,
        changedBy: platformPolicies.changedBy,
        changedAt: platformPolicies.changedAt,
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
      })
      .from(platformPolicies)
      .leftJoin(users, eq(users.id, platformPolicies.changedBy))
      .where(inArray(platformPolicies.key, [...PLATFORM_POLICY_KEYS]));
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return PLATFORM_POLICY_KEYS.map((key) => {
      const row = byKey.get(key);
      return {
        key,
        enabled: row?.enabled ?? false,
        changedBy: row?.changedBy ?? null,
        changedByName: row
          ? nameOf(row.givenName, row.familyName, row.email)
          : null,
        changedAt: row?.changedAt ?? null,
      };
    });
  }

  async isOn(key: PlatformPolicyKey): Promise<boolean> {
    const [row] = await this.db
      .select({ enabled: platformPolicies.enabled })
      .from(platformPolicies)
      .where(eq(platformPolicies.key, key));
    return row?.enabled ?? false;
  }

  /** Flips the switch and writes the audit row in one transaction; the change is in force at once. */
  async set(
    key: PlatformPolicyKey,
    enabled: boolean,
    actorId: string
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [before] = await tx
        .select({ enabled: platformPolicies.enabled })
        .from(platformPolicies)
        .where(eq(platformPolicies.key, key));
      await tx
        .insert(platformPolicies)
        .values({ key, enabled, changedBy: actorId })
        .onConflictDoUpdate({
          target: platformPolicies.key,
          set: { enabled, changedBy: actorId, changedAt: sql`now()` },
        });
      await tx.insert(auditLog).values({
        actorId,
        action: PLATFORM_POLICY_ACTION,
        entity: "platform_policy",
        entityId: PLATFORM_ENTITY_ID,
        details: { key, enabled, was: before?.enabled ?? false },
      });
    });
  }

  /**
   * Köşks that apply a rule on their own, with who flipped it and when as far
   * as the audit trail knows (a köşk that was opened with the rule on has no
   * such row, so those two are null). Hidden köşks are left out.
   */
  async scoped(): Promise<IScopedPolicy[]> {
    const out: IScopedPolicy[] = [];
    for (const key of PLATFORM_POLICY_KEYS) {
      const rows = await this.db
        .select({ id: kosks.id, name: kosks.name })
        .from(kosks)
        .where(and(eq(KOSK_COLUMN[key], true), isNull(kosks.archivedAt)))
        .orderBy(kosks.name);
      if (rows.length === 0) continue;
      const trail = await this.db
        .select({
          entityId: auditLog.entityId,
          actorId: auditLog.actorId,
          createdAt: auditLog.createdAt,
          details: auditLog.details,
          givenName: users.givenName,
          familyName: users.familyName,
          email: users.email,
        })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.actorId))
        .where(
          and(
            eq(auditLog.action, KOSK_POLICY_ACTION),
            inArray(
              auditLog.entityId,
              rows.map((r) => r.id)
            )
          )
        )
        .orderBy(desc(auditLog.createdAt));
      for (const row of rows) {
        const last = trail.find(
          (t) => t.entityId === row.id && t.details[KOSK_DETAIL[key]] === true
        );
        out.push({
          scopeId: row.id,
          scopeName: row.name,
          key,
          openedBy: last?.actorId ?? null,
          openedByName: last
            ? nameOf(last.givenName, last.familyName, last.email)
            : null,
          openedAt: last?.createdAt ?? null,
        });
      }
    }
    return out;
  }
}
