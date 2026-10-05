import { AuthzForbiddenError, AuthzService } from "@medaris/common";
import { Injectable, Logger } from "@nestjs/common";
import {
  SCOPE_TYPES,
  type ScopeType,
} from "../../database/schema/role-assignment.schema";
import { KeycloakAdminService } from "../../keycloak-admin/keycloak-admin.service";
import { TokenClaims } from "../../user/interfaces/token-claims.interface";
import { identityFromClaims } from "../../user/user-identity";
import { AssignmentRepository } from "../assignment.repository";
import {
  COURSE_CATALOG,
  COURSE_CODES,
  PLATFORM_CATALOG,
  PLATFORM_CODES,
} from "../permission-catalog";
import {
  type AppointMedarisNazimDto,
  type CreatePermissionGroupDto,
  type DismissMedarisNazimDto,
  type GivenItemResponse,
  GROUP_SCOPES,
  type GroupScope,
  type GroupUserResponse,
  type MedarisNazimResponse,
  type NazimPersonResponse,
  type PermissionCatalogResponse,
  type PermissionGroupResponse,
  type SetNazimGrantsDto,
  type UpdatePermissionGroupDto,
  type UsersPolicy,
} from "./dto/permission-admin.dto";
import {
  GrantExpiryInvalidError,
  MedarisNazimNotFoundError,
  PermissionGroupEmptyError,
  PermissionGroupNameTakenError,
  PermissionGroupNotFoundError,
  PermissionGroupScopeError,
  UnknownPermissionError,
  UsersPolicyRequiredError,
} from "./errors";
import { checkGrantExpiry, earliestEnd, extrasBeyondGroup } from "./grant-plan";
import {
  type IGroupRow,
  type INazimRole,
  type IPersonRow,
  PermissionAdminRepository,
} from "./permission-admin.repository";

export function groupScopeOf(row: {
  scopeType: ScopeType;
  scopeId: string | null;
}): GroupScope {
  if (row.scopeType === SCOPE_TYPES.PLATFORM) return "PLATFORM";
  return row.scopeId === null ? "ALL_COURSES" : "COURSE";
}

function personOf(
  id: string,
  people: Map<string, IPersonRow>
): NazimPersonResponse {
  const row = people.get(id);
  const name = row
    ? [row.givenName, row.familyName].filter(Boolean).join(" ").trim()
    : "";
  return { id, name: name || null, email: row?.email ?? null };
}

/**
 * The Medaris nazımları and İzin grupları screens (MDRS-171, nizam/11, 12 and
 * 13). Every method is the başnazım's alone — the Keycloak SYSTEM_ADMIN realm
 * role — and answers anyone else with a 403, which the web app shows as
 * nizam/06. Nothing here lets a Medaris nazımı hand on what they were given.
 */
@Injectable()
export class PermissionAdminService {
  private readonly logger = new Logger(PermissionAdminService.name);

  constructor(
    private readonly repo: PermissionAdminRepository,
    private readonly assignments: AssignmentRepository,
    private readonly authz: AuthzService,
    private readonly keycloak: KeycloakAdminService
  ) {}

  /** The caller's id, after checking they are the başnazım. */
  private actor(claims: TokenClaims): string {
    const identity = identityFromClaims(claims);
    if (!identity || !this.authz.isSystemAdmin(claims)) {
      throw new AuthzForbiddenError(
        "Only the Medaris başnazımı manages Medaris nazımları and permission groups"
      );
    }
    return identity.id;
  }

  // ---- the catalog -------------------------------------------------------

  catalog(claims: TokenClaims): PermissionCatalogResponse {
    this.actor(claims);
    return {
      platform: PLATFORM_CATALOG.map((s) => ({
        id: s.section,
        permissions: [...s.permissions],
      })),
      course: [...COURSE_CATALOG],
    };
  }

  // ---- Medaris nazımları -------------------------------------------------

  async listNazims(claims: TokenClaims): Promise<MedarisNazimResponse[]> {
    this.actor(claims);
    return this.present(await this.repo.heldNazimRoles());
  }

  async appoint(
    claims: TokenClaims,
    dto: AppointMedarisNazimDto
  ): Promise<MedarisNazimResponse> {
    const actor = this.actor(claims);
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (checkGrantExpiry(expiresAt, null, new Date()) === "past") {
      throw new GrantExpiryInvalidError("The end date is in the past");
    }
    const wanted = await this.wantedGrants(
      dto.groupId ?? null,
      dto.permissions
    );
    await this.repo.appoint(actor, {
      userId: dto.userId.toLowerCase(),
      expiresAt,
      ...wanted,
    });
    const [role] = await this.repo.heldNazimRoles(dto.userId.toLowerCase());
    const [presented] = await this.present(role ? [role] : []);
    return presented;
  }

  async setGrants(
    claims: TokenClaims,
    userId: string,
    dto: SetNazimGrantsDto
  ): Promise<MedarisNazimResponse> {
    const actor = this.actor(claims);
    const wanted = await this.wantedGrants(
      dto.groupId ?? null,
      dto.permissions
    );
    await this.repo.setGrants(actor, userId.toLowerCase(), {
      ...wanted,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    });
    const [role] = await this.repo.heldNazimRoles(userId.toLowerCase());
    const [presented] = await this.present(role ? [role] : []);
    return presented;
  }

  /** The group must be a live platform group; the extras are checked against the platform catalog. */
  private async wantedGrants(
    groupId: string | null,
    permissions: string[]
  ): Promise<{ groupId: string | null; permissions: string[] }> {
    this.checkCodes(permissions, PLATFORM_CODES);
    if (groupId === null)
      return { groupId, permissions: [...new Set(permissions)] };
    const group = (await this.repo.groupsById([groupId])).get(groupId);
    if (!group) throw new PermissionGroupNotFoundError(groupId);
    if (group.scopeType !== SCOPE_TYPES.PLATFORM) {
      throw new PermissionGroupScopeError(
        "Only a group defined for the platform can be given here"
      );
    }
    return {
      groupId,
      permissions: extrasBeyondGroup(permissions, group.permissions),
    };
  }

  async given(
    claims: TokenClaims,
    userId: string
  ): Promise<GivenItemResponse[]> {
    this.actor(claims);
    const id = userId.toLowerCase();
    const [role] = await this.repo.heldNazimRoles(id);
    if (!role) throw new MedarisNazimNotFoundError(id);
    const [rows, touched] = await Promise.all([
      this.repo.heldGivenBy(id),
      this.repo.groupsTouchedBy(id),
    ]);
    const [names, people, groups] = await Promise.all([
      this.assignments.findScopeNames([
        ...rows.map((r) => ({ type: r.scopeType, id: r.scopeId })),
        ...touched.map((t) => ({
          type: t.group.scopeType,
          id: t.group.scopeId,
        })),
      ]),
      this.resolvePeople(rows.map((r) => r.userId)),
      this.repo.groupsById(rows.flatMap((r) => (r.groupId ? [r.groupId] : []))),
    ]);
    const scopeName = (type: string, scopeId: string | null) =>
      type === SCOPE_TYPES.PLATFORM
        ? null
        : (names.get(`${type}:${scopeId ?? ""}`)?.name ?? null);
    const given: GivenItemResponse[] = rows.map((r) => ({
      kind: r.kind,
      id: r.id,
      role: r.role,
      permission: r.permission,
      groupName: r.groupId ? (groups.get(r.groupId)?.name ?? null) : null,
      to: personOf(r.userId, people),
      groupPermissions: null,
      groupAction: null,
      scopeType: r.scopeType,
      scopeName: scopeName(r.scopeType, r.scopeId),
    }));
    // The groups they defined or changed, after the roles and grants: the
    // başnazım reads these too, and nothing about them is asked on dismissal.
    for (const { group, action } of touched) {
      given.push({
        kind: "GROUP",
        id: group.id,
        role: null,
        permission: null,
        groupName: group.name,
        to: null,
        groupPermissions: group.permissions,
        groupAction: action,
        scopeType: group.scopeType,
        scopeName: scopeName(group.scopeType, group.scopeId),
      });
    }
    return given;
  }

  async dismiss(
    claims: TokenClaims,
    userId: string,
    dto: DismissMedarisNazimDto
  ): Promise<void> {
    const actor = this.actor(claims);
    await this.repo.dismiss(actor, userId.toLowerCase(), dto.decisions);
  }

  private async present(roles: INazimRole[]): Promise<MedarisNazimResponse[]> {
    if (roles.length === 0) return [];
    const userIds = roles.map((r) => r.userId);
    const grants = await this.repo.heldNazimGrants(userIds);
    const [groups, people] = await Promise.all([
      this.repo.groupsById(
        grants.flatMap((g) => (g.groupId ? [g.groupId] : []))
      ),
      this.resolvePeople([...userIds, ...roles.map((r) => r.grantedBy)]),
    ]);
    return roles.map((role) => {
      const mine = grants.filter((g) => g.userId === role.userId);
      const heldGroups: IGroupRow[] = mine.flatMap((g) => {
        const group = g.groupId ? groups.get(g.groupId) : undefined;
        return group ? [group] : [];
      });
      return {
        user: personOf(role.userId, people),
        appointedBy: personOf(role.grantedBy, people),
        appointedAt: role.createdAt,
        assignmentExpiresAt: role.expiresAt,
        expiresAt: earliestEnd([
          role.expiresAt,
          ...mine.map((g) => g.expiresAt),
        ]),
        groups: heldGroups.map((g) => ({
          id: g.id,
          name: g.name,
          scope: groupScopeOf(g),
          courseTitle: g.courseTitle,
          permissions: g.permissions,
        })),
        permissions: mine
          .filter(
            (g) => g.permission !== null && g.scopeType === SCOPE_TYPES.PLATFORM
          )
          .map((g) => ({
            code: g.permission as string,
            grantedAt: g.grantedAt,
          })),
      };
    });
  }

  /**
   * Names for the people a screen lists: the users table first (written at
   * sign-in), then the realm's directory for anyone who has never signed in —
   * a freshly appointed nazımı is exactly that. An unreachable directory is
   * not an error here; the row just has no name.
   */
  private async resolvePeople(ids: string[]): Promise<Map<string, IPersonRow>> {
    const people = await this.repo.people(ids);
    const missing = [...new Set(ids)].filter((id) => !people.has(id));
    if (missing.length > 0 && this.keycloak.isConfigured()) {
      const found = await Promise.allSettled(
        missing.map((id) => this.keycloak.findById(id))
      );
      found.forEach((result, i) => {
        if (result.status === "fulfilled" && result.value) {
          people.set(missing[i], result.value);
        } else if (result.status === "rejected") {
          this.logger.warn(`No directory name for ${missing[i]}`);
        }
      });
    }
    return people;
  }

  // ---- groups ------------------------------------------------------------

  async listGroups(claims: TokenClaims): Promise<PermissionGroupResponse[]> {
    this.actor(claims);
    return (await this.repo.listGroups()).map(presentGroup);
  }

  async createGroup(
    claims: TokenClaims,
    dto: CreatePermissionGroupDto
  ): Promise<PermissionGroupResponse> {
    const actor = this.actor(claims);
    const name = dto.name.trim();
    const permissions = this.groupCodes(dto.scope, dto.permissions);
    let scopeId: string | null = null;
    if (dto.scope === "COURSE") {
      if (!dto.courseId) {
        throw new PermissionGroupScopeError("A course group names its course");
      }
      if ((await this.repo.courseTitle(dto.courseId)) === null) {
        throw new PermissionGroupScopeError("No such course");
      }
      scopeId = dto.courseId;
    } else if (dto.courseId) {
      throw new PermissionGroupScopeError(
        "Only a group for one course names a course"
      );
    }
    if (await this.repo.nameTaken(name, scopeId)) {
      throw new PermissionGroupNameTakenError(name);
    }
    const id = await this.repo.createGroup(actor, {
      authority: SCOPE_TYPES.PLATFORM,
      name,
      scopeType:
        dto.scope === "PLATFORM" ? SCOPE_TYPES.PLATFORM : SCOPE_TYPES.COURSE,
      scopeId,
      permissions,
    });
    return presentGroup(await this.mustFind(id));
  }

  async updateGroup(
    claims: TokenClaims,
    id: string,
    dto: UpdatePermissionGroupDto
  ): Promise<PermissionGroupResponse> {
    const actor = this.actor(claims);
    const group = await this.mustFind(id);
    const name = dto.name.trim();
    const permissions = this.groupCodes(groupScopeOf(group), dto.permissions);
    const changed =
      permissions.length !== group.permissions.length ||
      permissions.some((c) => !group.permissions.includes(c));
    if (changed && group.userCount > 0 && !dto.usersPolicy) {
      throw new UsersPolicyRequiredError(group.userCount);
    }
    if (await this.repo.nameTaken(name, group.scopeId, id)) {
      throw new PermissionGroupNameTakenError(name);
    }
    await this.repo.updateGroup(actor, id, {
      authority: SCOPE_TYPES.PLATFORM,
      name,
      permissions,
      usersPolicy: dto.usersPolicy ?? null,
    });
    return presentGroup(await this.mustFind(id));
  }

  async deleteGroup(
    claims: TokenClaims,
    id: string,
    usersPolicy: UsersPolicy | undefined
  ): Promise<void> {
    const actor = this.actor(claims);
    const group = await this.mustFind(id);
    if (group.userCount > 0 && !usersPolicy) {
      throw new UsersPolicyRequiredError(group.userCount);
    }
    await this.repo.deleteGroup(
      actor,
      id,
      usersPolicy ?? null,
      SCOPE_TYPES.PLATFORM
    );
  }

  async groupUsers(
    claims: TokenClaims,
    id: string
  ): Promise<GroupUserResponse[]> {
    this.actor(claims);
    await this.mustFind(id);
    const rows = await this.repo.groupUsers(id);
    const [people, nazims] = await Promise.all([
      this.resolvePeople(rows.map((r) => r.userId)),
      this.repo.nazimUserIds(rows.map((r) => r.userId)),
    ]);
    return rows.map((r) => {
      const person = personOf(r.userId, people);
      return {
        userId: r.userId,
        name: person.name,
        email: person.email,
        isMedarisNazim: nazims.has(r.userId),
        expiresAt: r.expiresAt,
      };
    });
  }

  /** A live platform or course group; a medrese's own groups are not this screen's (MDRS-185). */
  private async mustFind(id: string) {
    const group = await this.repo.findGroup(id);
    if (!group || group.scopeType === SCOPE_TYPES.MADRASAH) {
      throw new PermissionGroupNotFoundError(id);
    }
    return group;
  }

  /** The codes of a group: de-duplicated, at least one, all in the scope's catalog. */
  private groupCodes(scope: GroupScope, codes: string[]): string[] {
    if (!GROUP_SCOPES.includes(scope)) {
      throw new PermissionGroupScopeError("Unknown scope");
    }
    const unique = [...new Set(codes)];
    if (unique.length === 0) throw new PermissionGroupEmptyError();
    this.checkCodes(
      unique,
      scope === "PLATFORM" ? PLATFORM_CODES : COURSE_CODES
    );
    return unique;
  }

  private checkCodes(codes: string[], allowed: ReadonlySet<string>) {
    const unknown = [...new Set(codes)].filter((c) => !allowed.has(c));
    if (unknown.length > 0) throw new UnknownPermissionError(unknown);
  }
}

function presentGroup(
  group: IGroupRow & { userCount: number }
): PermissionGroupResponse {
  return {
    id: group.id,
    name: group.name,
    scope: groupScopeOf(group),
    courseId: group.scopeType === SCOPE_TYPES.COURSE ? group.scopeId : null,
    courseTitle: group.courseTitle,
    permissions: group.permissions,
    userCount: group.userCount,
  };
}
