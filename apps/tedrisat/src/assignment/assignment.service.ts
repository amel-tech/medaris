import { AuthzService, type ScopeRef } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { TedrisatAuthzContext } from "../authz/tedrisat-authz-context.service";
import { SCOPE_TYPES } from "../database/schema/role-assignment.schema";
import { MeScopePermissions } from "../user/dto/me-response.dto";
import { TokenClaims } from "../user/interfaces/token-claims.interface";
import { identityFromClaims } from "../user/user-identity";
import {
  AssignmentRepository,
  type IPersonName,
} from "./assignment.repository";
import {
  AssignmentResponse,
  GrantResponse,
  MyAssignmentsResponse,
  MyEffectivePermissionsResponse,
  MyGrantsResponse,
  MyPermissionsResponse,
  MyRolesResponse,
  PersonRef,
} from "./dto/assignment-response.dto";
import {
  buildEffectivePermissions,
  flattenPermissions,
} from "./effective-permissions";
import { permissionsPerScope } from "./me-permissions";
import { isPermissionCode } from "./permission-catalog";

export function displayNameOf(person: IPersonName | undefined): string | null {
  if (!person) return null;
  const name = [person.givenName, person.familyName]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .trim();
  return name || person.email;
}

const scopeKey = (type: string, id: string | null) => `${type}:${id ?? ""}`;

@Injectable()
export class AssignmentService {
  constructor(
    private readonly repo: AssignmentRepository,
    private readonly authz: AuthzService,
    private readonly context: TedrisatAuthzContext
  ) {}

  /** A token whose `sub` is not a UUID holds nothing, and would be a 22P02. */
  private userIdOf(claims: TokenClaims): string | null {
    return identityFromClaims(claims)?.id ?? null;
  }

  async myAssignments(claims: TokenClaims): Promise<MyAssignmentsResponse> {
    const userId = this.userIdOf(claims);
    if (!userId) return { assignments: [] };
    const held = await this.repo.findHeldAssignments(userId);
    const [names, people] = await Promise.all([
      this.repo.findScopeNames(
        held.map((r) => ({ type: r.scopeType, id: r.scopeId }))
      ),
      this.repo.findPeople(held.map((r) => r.grantedBy)),
    ]);
    return { assignments: describeAssignments(userId, held, names, people) };
  }

  /**
   * What `GET /me` adds to the profile (MDRS-142): the live role assignments
   * and, scope by scope, what the caller holds there. One pass over what they
   * hold, never `authz.effective()` per scope (five statements each, on the
   * page every sign-in loads): the role rows, the two reads of the engine's
   * loader, the scopes' names and the people who granted, whatever the number
   * of scopes.
   */
  async myOverview(claims: TokenClaims): Promise<{
    assignments: AssignmentResponse[];
    permissions: MeScopePermissions[];
  }> {
    const userId = this.userIdOf(claims);
    if (!userId) return { assignments: [], permissions: [] };
    const [held, holdings] = await Promise.all([
      this.repo.findHeldAssignments(userId),
      this.context.holdings(userId),
    ]);
    const asRef = (scope: ScopeRef) => ({ type: scope.type, id: scope.id });
    const [names, people] = await Promise.all([
      this.repo.findScopeNames([
        ...held.map((r) => ({ type: r.scopeType, id: r.scopeId })),
        ...holdings.grants.map((g) => asRef(g.scope)),
      ]),
      this.repo.findPeople(held.map((r) => r.grantedBy)),
    ]);
    const permissions = permissionsPerScope(
      holdings.roles,
      holdings.grants,
      (scope) => {
        const named = names.get(scopeKey(scope.type, scope.id));
        if (!named) return null;
        return {
          name: named.name,
          koskId: named.course?.koskId,
          madrasahId: named.course?.madrasahId,
        };
      }
    );
    return {
      assignments: describeAssignments(userId, held, names, people),
      permissions,
    };
  }

  async myRoles(claims: TokenClaims): Promise<MyRolesResponse> {
    const { assignments } = await this.myAssignments(claims);
    const counts = new Map<string, number>();
    for (const a of assignments) {
      counts.set(a.role, (counts.get(a.role) ?? 0) + 1);
    }
    return {
      systemAdmin: this.authz.isSystemAdmin(claims),
      roles: [...counts].map(([role, scopeCount]) => ({ role, scopeCount })),
    };
  }

  async myGrants(claims: TokenClaims): Promise<MyGrantsResponse> {
    const userId = this.userIdOf(claims);
    if (!userId) return { grants: [] };
    const held = await this.repo.findHeldGrants(userId);
    const [names, people, groups] = await Promise.all([
      this.repo.findScopeNames(
        held.map((r) => ({ type: r.scopeType, id: r.scopeId }))
      ),
      this.repo.findPeople(held.map((r) => r.grantedBy)),
      this.repo.findGroups(held.flatMap((r) => (r.groupId ? [r.groupId] : []))),
    ]);
    const rows = held.filter((r) => scopeExists(r, names));
    const grants: GrantResponse[] = rows.map((row) => ({
      id: row.id,
      scopeType: row.scopeType,
      scopeId: row.scopeId,
      scopeName: names.get(scopeKey(row.scopeType, row.scopeId))?.name ?? null,
      permission: row.permission,
      group: row.groupId ? (groups.get(row.groupId) ?? null) : null,
      grantedAt: row.grantedAt,
      expiresAt: row.expiresAt,
      grantedBy: personRef(row.grantedBy, people),
      grantedBySelf: row.grantedBy === userId,
    }));
    return { grants };
  }

  async myEffectivePermissions(
    claims: TokenClaims
  ): Promise<MyEffectivePermissionsResponse> {
    const userId = this.userIdOf(claims);
    if (!userId) return { groups: [] };
    const [heldRows, heldGrants] = await Promise.all([
      this.repo.findHeldAssignments(userId),
      this.repo.findHeldGrants(userId),
    ]);
    const [names, groups] = await Promise.all([
      this.repo.findScopeNames([
        ...heldRows.map((r) => ({ type: r.scopeType, id: r.scopeId })),
        ...heldGrants.map((r) => ({ type: r.scopeType, id: r.scopeId })),
      ]),
      this.repo.findGroups(
        heldGrants.flatMap((r) => (r.groupId ? [r.groupId] : []))
      ),
    ]);
    const assignmentRows = heldRows.filter((r) => scopeExists(r, names));
    const grantRows = heldGrants.filter((g) => scopeExists(g, names));
    const nameOf = (type: string, id: string | null) =>
      type === SCOPE_TYPES.PLATFORM
        ? null
        : (names.get(scopeKey(type, id))?.name ?? null);

    const courseParents = new Map<
      string,
      { koskId: string; madrasahId: string | null }
    >();
    for (const [key, named] of names) {
      if (named.course && key.startsWith(`${SCOPE_TYPES.COURSE}:`)) {
        courseParents.set(key.slice(SCOPE_TYPES.COURSE.length + 1), {
          koskId: named.course.koskId,
          madrasahId: named.course.madrasahId,
        });
      }
    }
    const built = buildEffectivePermissions(
      assignmentRows.map((r) => ({
        role: r.role,
        type: r.scopeType,
        id: r.scopeId,
        name: nameOf(r.scopeType, r.scopeId),
      })),
      grantRows.map((g) => ({
        type: g.scopeType,
        id: g.scopeId,
        name: nameOf(g.scopeType, g.scopeId),
        codes: (g.permission
          ? [g.permission]
          : (groups.get(g.groupId ?? "")?.permissions ?? [])
        ).filter(isPermissionCode),
      })),
      (courseId) => courseParents.get(courseId) ?? null
    );
    return {
      groups: built.map((group) => ({
        role: group.role,
        scopeType: group.scopeType,
        scopes: group.scopes,
        permissions: group.permissions,
      })),
    };
  }

  async myPermissions(claims: TokenClaims): Promise<MyPermissionsResponse> {
    const { groups } = await this.myEffectivePermissions(claims);
    return { permissions: flattenPermissions(groups) };
  }
}

/**
 * `scope_id` is no foreign key, so a role can outlive the scope it names (a
 * köşk, a medrese or a course deleted outside the purge path). Such a row says
 * nothing a person can act on and is left out, never shown as a nameless scope.
 */
function scopeExists(
  row: { scopeType: string; scopeId: string | null },
  names: Map<string, unknown>
): boolean {
  return (
    row.scopeType === SCOPE_TYPES.PLATFORM ||
    names.has(scopeKey(row.scopeType, row.scopeId))
  );
}

function describeAssignments(
  userId: string,
  held: Awaited<ReturnType<AssignmentRepository["findHeldAssignments"]>>,
  names: Awaited<ReturnType<AssignmentRepository["findScopeNames"]>>,
  people: Map<string, IPersonName>
): AssignmentResponse[] {
  return held
    .filter((row) => scopeExists(row, names))
    .map((row) => {
      const named = names.get(scopeKey(row.scopeType, row.scopeId));
      return {
        id: row.id,
        role: row.role,
        scopeType: row.scopeType,
        scopeId: row.scopeId,
        scopeName: named?.name ?? null,
        isImam: row.isImam,
        grantedAt: row.grantedAt,
        expiresAt: row.expiresAt,
        grantedBy: personRef(row.grantedBy, people),
        grantedBySelf: row.grantedBy === userId,
        ...(named?.course ? { course: named.course } : {}),
      };
    });
}

function personRef(id: string, people: Map<string, IPersonName>): PersonRef {
  return { id, displayName: displayNameOf(people.get(id)) };
}
