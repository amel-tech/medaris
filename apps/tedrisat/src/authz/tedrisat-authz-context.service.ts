import {
  type AuthzContextLoader,
  ENTITIES,
  type IAuthzContext,
  type IDeckVisibility,
  type IHeldGrantCodes,
  type IHeldRole,
  type IPolicyOn,
  isPermissionCode,
  MANAGER_ROLE_OF,
  type PermissionCode,
  POLICY_KEYS,
  type PolicyKey,
  ResourceRef,
  SCOPE_TYPES,
  type ScopeRef,
} from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { grantHeld } from "../assignment/assignment.repository";
import { DatabaseService } from "../database/database.service";
import { isHeld } from "../database/role-assignments";
import { courses } from "../database/schema/course.schema";
import { decks } from "../database/schema/flashcard-deck.schema";
import { kosks } from "../database/schema/kosk.schema";
import {
  madrasahSettings,
  madrasahs,
} from "../database/schema/madrasah.schema";
import {
  permissionGrants,
  permissionGroupItems,
  permissionGroups,
} from "../database/schema/permission.schema";
import { platformPolicies } from "../database/schema/platform-policy.schema";
import { roleAssignments } from "../database/schema/role-assignment.schema";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PLATFORM: ScopeRef = { type: SCOPE_TYPES.PLATFORM, id: null };

interface IResourceFacts {
  chain: ScopeRef[];
  madrasahCourse: boolean;
  policies: IPolicyOn[];
}

/**
 * Everything one authorization decision needs about a resource and the
 * caller, in a bounded number of queries (MDRS-135 §7): one for the resource's
 * own row, which names its köşk and medrese and carries their policies, then
 * four side by side: the roles the caller holds, their grants with the codes
 * of their groups, who manages each scope on the chain (for passive scopes) and
 * the platform's policies. That is five queries and two round trips however
 * many scopes, grants or groups there are.
 *
 * Expiry and revocation are decided in those queries against the database
 * clock (`isHeld`, `grantHeld`), so a role or grant that ran out is gone from
 * the very next decision with nothing cached anywhere. It reads through
 * `DatabaseService` alone: the feature modules reach `AuthzService` through
 * `ROLE_RESOLVER`, and a loader that reached them back would close a provider
 * cycle Nest answers by never finishing `compile()`.
 */
@Injectable()
export class TedrisatAuthzContext implements AuthzContextLoader {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  async load(userId: string, rawResource: ResourceRef): Promise<IAuthzContext> {
    // The chain below holds the resource's own id next to the ids the
    // database answers; both are lower case or the resource's own scope drops
    // out of the roles, the grants and the passive-scope check.
    const resource = { ...rawResource, id: rawResource.id.toLowerCase() };
    const facts = UUID_REGEX.test(resource.id)
      ? await this.facts(resource)
      : null;
    const chain = facts?.chain ?? [PLATFORM];
    const scopeIds = chain.flatMap((c) => (c.id ? [c.id] : []));

    const [roles, grants, managers, platform] = await Promise.all([
      this.heldRoles(userId, scopeIds),
      this.heldGrants(userId, scopeIds),
      this.managerStats(chain),
      this.platformPolicies(),
    ]);

    const passiveScope =
      chain.find((scope) => {
        if (scope.id === null) return false;
        const stat = managers.get(scope.id);
        return stat !== undefined && stat.total > 0 && stat.held === 0;
      }) ?? null;

    return {
      chain,
      madrasahCourse: facts?.madrasahCourse ?? false,
      passiveScope,
      policies: [...platform, ...(facts?.policies ?? [])],
      roles,
      grants,
    };
  }

  async findDeck(id: string): Promise<IDeckVisibility | null> {
    const [row] = await this.db
      .select({ isPublic: decks.isPublic, authorId: decks.authorId })
      .from(decks)
      .where(eq(decks.id, id))
      .limit(1);
    return row ?? null;
  }

  private async facts(resource: ResourceRef): Promise<IResourceFacts | null> {
    switch (resource.entity) {
      case ENTITIES.COURSE: {
        const [row] = await this.db
          .select({
            koskId: courses.koskId,
            madrasahId: courses.madrasahId,
            kApproval: kosks.alwaysRequireApproval,
            kRecordings: kosks.recordingsNeverPublic,
            mApproval: madrasahSettings.policyAlwaysApproval,
            mRecordings: madrasahSettings.policyNoPublicRecordings,
            mClosed: madrasahSettings.policyClosedCourseRequired,
          })
          .from(courses)
          .innerJoin(kosks, eq(kosks.id, courses.koskId))
          .leftJoin(
            madrasahSettings,
            eq(madrasahSettings.madrasahId, courses.madrasahId)
          )
          .where(eq(courses.id, resource.id))
          .limit(1);
        if (!row) return null;
        const chain: ScopeRef[] = [
          { type: SCOPE_TYPES.COURSE, id: resource.id },
        ];
        const policies: IPolicyOn[] = [
          ...koskPolicies(row.koskId, row.kApproval, row.kRecordings),
        ];
        if (row.madrasahId) {
          chain.push({ type: SCOPE_TYPES.MADRASAH, id: row.madrasahId });
          policies.push(
            ...madrasahPolicies(
              row.madrasahId,
              row.mApproval ?? false,
              row.mRecordings ?? false,
              row.mClosed ?? false
            )
          );
        }
        chain.push({ type: SCOPE_TYPES.KOSK, id: row.koskId }, PLATFORM);
        return {
          chain,
          madrasahCourse: row.madrasahId !== null,
          policies,
        };
      }
      case ENTITIES.KOSK: {
        const [row] = await this.db
          .select({
            approval: kosks.alwaysRequireApproval,
            recordings: kosks.recordingsNeverPublic,
          })
          .from(kosks)
          .where(eq(kosks.id, resource.id))
          .limit(1);
        if (!row) return null;
        return {
          chain: [{ type: SCOPE_TYPES.KOSK, id: resource.id }, PLATFORM],
          madrasahCourse: false,
          policies: koskPolicies(resource.id, row.approval, row.recordings),
        };
      }
      case ENTITIES.MADRASAH: {
        const [row] = await this.db
          .select({
            id: madrasahs.id,
            approval: madrasahSettings.policyAlwaysApproval,
            recordings: madrasahSettings.policyNoPublicRecordings,
            closed: madrasahSettings.policyClosedCourseRequired,
          })
          .from(madrasahs)
          .leftJoin(
            madrasahSettings,
            eq(madrasahSettings.madrasahId, madrasahs.id)
          )
          .where(eq(madrasahs.id, resource.id))
          .limit(1);
        if (!row) return null;
        return {
          chain: [{ type: SCOPE_TYPES.MADRASAH, id: resource.id }, PLATFORM],
          madrasahCourse: false,
          policies: madrasahPolicies(
            resource.id,
            row.approval ?? false,
            row.recordings ?? false,
            row.closed ?? false
          ),
        };
      }
      default:
        return null;
    }
  }

  private async heldRoles(
    userId: string,
    scopeIds: string[]
  ): Promise<IHeldRole[]> {
    const rows = await this.db
      .select({
        role: roleAssignments.role,
        scopeType: roleAssignments.scopeType,
        scopeId: roleAssignments.scopeId,
      })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.userId, userId),
          isHeld(),
          // The platform's roles as `scope_id is null`, which the CHECK
          // `role_assignments_scope_id_present` makes the same rows as
          // `scope_type = 'platform'`: the planner can then serve both arms
          // from the two partial indexes on `user_id` (a BitmapOr) instead of
          // reading every row ever assigned.
          or(
            isNull(roleAssignments.scopeId),
            scopeIds.length > 0
              ? inArray(roleAssignments.scopeId, scopeIds)
              : undefined
          )
        )
      );
    return rows.map((row) => ({
      role: row.role,
      scope: { type: row.scopeType, id: row.scopeId },
    }));
  }

  private async heldGrants(
    userId: string,
    scopeIds: string[]
  ): Promise<IHeldGrantCodes[]> {
    const rows = await this.db
      .select({
        id: permissionGrants.id,
        scopeType: permissionGrants.scopeType,
        scopeId: permissionGrants.scopeId,
        permission: permissionGrants.permission,
        authority: permissionGrants.authorityScopeType,
        item: permissionGroupItems.permission,
      })
      .from(permissionGrants)
      .leftJoin(
        permissionGroups,
        eq(permissionGroups.id, permissionGrants.groupId)
      )
      .leftJoin(
        permissionGroupItems,
        eq(permissionGroupItems.groupId, permissionGrants.groupId)
      )
      .where(
        and(
          eq(permissionGrants.userId, userId),
          grantHeld(),
          or(
            isNull(permissionGrants.groupId),
            isNull(permissionGroups.deletedAt)
          ),
          or(
            eq(permissionGrants.scopeType, SCOPE_TYPES.PLATFORM),
            // "Every course": a course grant without an id.
            and(
              eq(permissionGrants.scopeType, SCOPE_TYPES.COURSE),
              isNull(permissionGrants.scopeId)
            ),
            scopeIds.length > 0
              ? inArray(permissionGrants.scopeId, scopeIds)
              : undefined
          )
        )
      );
    const byGrant = new Map<
      string,
      {
        scope: ScopeRef;
        authority: IHeldGrantCodes["authority"];
        codes: Set<PermissionCode>;
      }
    >();
    for (const row of rows) {
      const grant = byGrant.get(row.id) ?? {
        scope: { type: row.scopeType, id: row.scopeId },
        authority: row.authority,
        codes: new Set<PermissionCode>(),
      };
      for (const code of [row.permission, row.item]) {
        if (code && isPermissionCode(code)) grant.codes.add(code);
      }
      byGrant.set(row.id, grant);
    }
    return [...byGrant.values()].map((grant) => ({
      scope: grant.scope,
      authority: grant.authority,
      codes: [...grant.codes],
    }));
  }

  /**
   * For each scope on the chain that has a manager role: how many people ever
   * held it and how many hold it now. A scope that once had a manager and has
   * none now is passive; one that never had one is new, not passive.
   */
  private async managerStats(
    chain: readonly ScopeRef[]
  ): Promise<Map<string, { total: number; held: number }>> {
    const result = new Map<string, { total: number; held: number }>();
    const wanted = chain.flatMap((scope) => {
      const role = MANAGER_ROLE_OF[scope.type];
      return scope.id && role ? [{ id: scope.id, role }] : [];
    });
    if (wanted.length === 0) return result;
    const rows = await this.db
      .select({
        scopeId: roleAssignments.scopeId,
        role: roleAssignments.role,
        total: sql<number>`count(*)::int`,
        held: sql<number>`count(*) filter (where ${isHeld()})::int`,
      })
      .from(roleAssignments)
      .where(
        and(
          inArray(
            roleAssignments.scopeId,
            wanted.map((w) => w.id)
          ),
          inArray(roleAssignments.role, [...new Set(wanted.map((w) => w.role))])
        )
      )
      .groupBy(roleAssignments.scopeId, roleAssignments.role);
    for (const row of rows) {
      const manager = wanted.find(
        (w) => w.id.toLowerCase() === row.scopeId && w.role === row.role
      );
      if (manager && row.scopeId) {
        result.set(row.scopeId, { total: row.total, held: row.held });
      }
    }
    return result;
  }

  private async platformPolicies(): Promise<IPolicyOn[]> {
    const rows = await this.db
      .select({ key: platformPolicies.key })
      .from(platformPolicies)
      .where(eq(platformPolicies.enabled, true));
    return rows.flatMap((row) =>
      row.key in POLICY_KEYS
        ? [
            {
              key: row.key as PolicyKey,
              level: SCOPE_TYPES.PLATFORM,
              scopeId: null,
            },
          ]
        : []
    );
  }
}

function koskPolicies(
  koskId: string,
  approval: boolean,
  recordings: boolean
): IPolicyOn[] {
  const on: IPolicyOn[] = [];
  if (approval) {
    on.push({
      key: POLICY_KEYS.ALWAYS_REQUIRE_APPROVAL,
      level: SCOPE_TYPES.KOSK,
      scopeId: koskId,
    });
  }
  if (recordings) {
    on.push({
      key: POLICY_KEYS.RECORDINGS_NEVER_PUBLIC,
      level: SCOPE_TYPES.KOSK,
      scopeId: koskId,
    });
  }
  return on;
}

function madrasahPolicies(
  madrasahId: string,
  approval: boolean,
  recordings: boolean,
  closed: boolean
): IPolicyOn[] {
  const on: IPolicyOn[] = [];
  const at = (key: PolicyKey): IPolicyOn => ({
    key,
    level: SCOPE_TYPES.MADRASAH,
    scopeId: madrasahId,
  });
  if (approval) on.push(at(POLICY_KEYS.ALWAYS_REQUIRE_APPROVAL));
  if (recordings) on.push(at(POLICY_KEYS.RECORDINGS_NEVER_PUBLIC));
  if (closed) on.push(at(POLICY_KEYS.CLOSED_COURSE_REQUIRED));
  return on;
}
