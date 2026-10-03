import {
  type AuthenticatedUser,
  AuthzService,
  ENTITIES,
  PERMISSIONS,
  SelfGrantGuard,
} from "@medaris/common";
import { Injectable } from "@nestjs/common";
import type { UsersPolicy } from "../../assignment/admin/dto/permission-admin.dto";
import {
  PermissionGroupEmptyError,
  PermissionGroupNameTakenError,
  PermissionGroupNotFoundError,
  UnknownPermissionError,
  UsersPolicyRequiredError,
} from "../../assignment/admin/errors";
import {
  type IGroupRow,
  PermissionAdminRepository,
} from "../../assignment/admin/permission-admin.repository";
import {
  MADRASAH_CATALOG,
  MADRASAH_CODES,
  MADRASAH_COURSE_CATALOG,
  MADRASAH_COURSE_CODES,
} from "../../assignment/permission-catalog";
import {
  SCOPE_TYPES,
  type ScopeType,
} from "../../database/schema/role-assignment.schema";
import { NazirCourseScopeError } from "../errors/nazir-course-scope.error";
import { NazirNotFoundError } from "../errors/nazir-not-found.error";
import { PermissionNotGivableError } from "../errors/permission-not-givable.error";
import type { MadrasahNazirResponse } from "./dto/madrasah-nazir.dto";
import type {
  CreateMadrasahPermissionGroupDto,
  MadrasahGroupScope,
  MadrasahNazirPermissionsResponse,
  MadrasahPermissionCatalogResponse,
  MadrasahPermissionGroupResponse,
  SetMadrasahNazirPermissionsDto,
  UpdateMadrasahPermissionGroupDto,
} from "./dto/madrasah-permission.dto";
import { MadrasahNazirRepository } from "./madrasah-nazir.repository";
import { MadrasahNazirService } from "./madrasah-nazir.service";
import {
  courseScopeProblem,
  describeHeldGrants,
  extrasToStore,
  wantedScopes,
} from "./nazir-grant-scopes";

const ANY_CODE: ReadonlySet<string> = new Set([
  ...MADRASAH_CODES,
  ...MADRASAH_COURSE_CODES,
]);

/** A group's scope is read off its permissions; it is not stored (MDRS-185). */
export function madrasahGroupScopeOf(
  permissions: readonly string[]
): MadrasahGroupScope {
  return permissions.some((code) => MADRASAH_CODES.has(code))
    ? "MADRASAH"
    : "COURSE";
}

const COURSE_SCOPE_MESSAGES = {
  "none-chosen": "Choose at least one course, or leave the courses out for all",
  "group-spans-medrese":
    "A group with medrese permissions covers every course of the medrese",
  "no-course-permissions":
    "No course permission is given, so there is nothing to limit to courses",
} as const;

function presentGroup(
  group: IGroupRow & { userCount: number }
): MadrasahPermissionGroupResponse {
  return {
    id: group.id,
    name: group.name,
    scope: madrasahGroupScopeOf(group.permissions),
    permissions: group.permissions,
    userCount: group.userCount,
  };
}

/**
 * What the medrese's başmüderris gives its nazırs and the groups they give it
 * through (MDRS-185, nazir/06 and nazir/16). Reached through
 * `MadrasahPermissionController`, whose `@Authz` permission lets the
 * başmüderris, SYSTEM_ADMIN and a Medaris nazımı given it in; the writes here
 * check that again from the engine, because a nazır who holds
 * `madrasah.nazir_appoint` by a grant must still not hand on what they were
 * given: only a role's own `permission.grant` gives permissions.
 */
@Injectable()
export class MadrasahPermissionService {
  constructor(
    private readonly repo: MadrasahNazirRepository,
    private readonly nazirs: MadrasahNazirService,
    private readonly groups: PermissionAdminRepository,
    private readonly authz: AuthzService,
    private readonly selfGrant: SelfGrantGuard
  ) {}

  /**
   * The level the caller gives permissions at in this medrese, or null: the
   * başnazım gives as the platform; a başmüderris gives in their medrese from
   * the `permission.grant` their role holds (never a grant — what you were
   * given you cannot give on); a Medaris nazımı holding
   * `platform.madrasah_nazir_grant` gives as the platform, and may give every
   * grantable medrese and course permission whatever they hold themselves
   * (owner decision, MDRS-209: "Hepsi, her grant denetlenip başnazıma
   * gösterilsin"): there is no ceiling at their own empty default, and in
   * return every grant, group change and appointment is written to the audit
   * log with its level and is listed to the başnazım under what they handed
   * on. Asked of the engine, so the screens, the guard and this check cannot
   * disagree.
   */
  private async authorityOf(
    user: AuthenticatedUser,
    madrasahId: string
  ): Promise<ScopeType | null> {
    if (this.authz.isSystemAdmin(user)) return SCOPE_TYPES.PLATFORM;
    const resource = { entity: ENTITIES.MADRASAH, id: madrasahId };
    if (await this.authz.can(user, resource, PERMISSIONS.PERMISSION_GRANT)) {
      return SCOPE_TYPES.MADRASAH;
    }
    if (
      await this.authz.can(
        user,
        resource,
        PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT
      )
    ) {
      return SCOPE_TYPES.PLATFORM;
    }
    return null;
  }

  private async mayGive(
    user: AuthenticatedUser,
    madrasahId: string
  ): Promise<boolean> {
    return (await this.authorityOf(user, madrasahId)) !== null;
  }

  /**
   * The caller's id and the level they give at, after checking they may give
   * permissions in the medrese. The level goes into the audit row of every
   * grant and group change, so the başnazım can tell a Medaris nazımı's gifts
   * (the platform) from the başmüderris's (the medrese).
   */
  private async actor(
    user: AuthenticatedUser,
    madrasahId: string
  ): Promise<{ id: string; authority: ScopeType }> {
    const authority = await this.authorityOf(user, madrasahId);
    if (authority === null) throw new PermissionNotGivableError();
    return { id: user.sub, authority };
  }

  // ---- the dictionary and the groups -------------------------------------

  async catalog(
    user: AuthenticatedUser,
    madrasahId: string
  ): Promise<MadrasahPermissionCatalogResponse> {
    return {
      madrasah: [...MADRASAH_CATALOG],
      course: [...MADRASAH_COURSE_CATALOG],
      givable: (await this.mayGive(user, madrasahId))
        ? [...MADRASAH_CATALOG, ...MADRASAH_COURSE_CATALOG]
        : [],
    };
  }

  async listGroups(
    madrasahId: string
  ): Promise<MadrasahPermissionGroupResponse[]> {
    return (await this.groups.listGroups(madrasahId)).map(presentGroup);
  }

  async createGroup(
    user: AuthenticatedUser,
    madrasahId: string,
    dto: CreateMadrasahPermissionGroupDto
  ): Promise<MadrasahPermissionGroupResponse> {
    const { id: actor, authority } = await this.actor(user, madrasahId);
    const name = dto.name.trim();
    const permissions = this.groupCodes(
      dto.permissions,
      dto.scope === "MADRASAH" ? ANY_CODE : MADRASAH_COURSE_CODES
    );
    if (await this.groups.nameTaken(name, madrasahId)) {
      throw new PermissionGroupNameTakenError(name);
    }
    const id = await this.groups.createGroup(actor, {
      name,
      scopeType: SCOPE_TYPES.MADRASAH,
      scopeId: madrasahId,
      permissions,
      authority,
    });
    return presentGroup(await this.mustFindGroup(madrasahId, id));
  }

  async updateGroup(
    user: AuthenticatedUser,
    madrasahId: string,
    groupId: string,
    dto: UpdateMadrasahPermissionGroupDto
  ): Promise<MadrasahPermissionGroupResponse> {
    const { id: actor, authority } = await this.actor(user, madrasahId);
    const group = await this.mustFindGroup(madrasahId, groupId);
    const name = dto.name?.trim() ?? group.name;
    const permissions = dto.permissions
      ? this.groupCodes(dto.permissions, ANY_CODE)
      : group.permissions;
    const changed =
      permissions.length !== group.permissions.length ||
      permissions.some((code) => !group.permissions.includes(code));
    if (changed && group.userCount > 0 && !dto.usersPolicy) {
      throw new UsersPolicyRequiredError(group.userCount);
    }
    if (await this.groups.nameTaken(name, madrasahId, groupId)) {
      throw new PermissionGroupNameTakenError(name);
    }
    await this.groups.updateGroup(actor, groupId, {
      name,
      permissions,
      usersPolicy: dto.usersPolicy ?? null,
      authority,
    });
    return presentGroup(await this.mustFindGroup(madrasahId, groupId));
  }

  async deleteGroup(
    user: AuthenticatedUser,
    madrasahId: string,
    groupId: string,
    usersPolicy: UsersPolicy | undefined
  ): Promise<void> {
    const { id: actor, authority } = await this.actor(user, madrasahId);
    const group = await this.mustFindGroup(madrasahId, groupId);
    if (group.userCount > 0 && !usersPolicy) {
      throw new UsersPolicyRequiredError(group.userCount);
    }
    await this.groups.deleteGroup(
      actor,
      groupId,
      usersPolicy ?? null,
      authority
    );
  }

  /** A live group of this medrese; another medrese's, the platform's and a missing one are all not found. */
  private async mustFindGroup(madrasahId: string, groupId: string) {
    const group = await this.groups.findGroup(groupId);
    if (
      !group ||
      group.scopeType !== SCOPE_TYPES.MADRASAH ||
      group.scopeId !== madrasahId
    ) {
      throw new PermissionGroupNotFoundError(groupId);
    }
    return group;
  }

  /** The codes of a group: de-duplicated, at least one, all from `allowed`. */
  private groupCodes(codes: string[], allowed: ReadonlySet<string>): string[] {
    const unique = [...new Set(codes)];
    if (unique.length === 0) throw new PermissionGroupEmptyError();
    this.checkCodes(unique, allowed);
    return unique;
  }

  private checkCodes(codes: string[], allowed: ReadonlySet<string>) {
    const unknown = [...new Set(codes)].filter((code) => !allowed.has(code));
    if (unknown.length > 0) throw new UnknownPermissionError(unknown);
  }

  // ---- one nazır ----------------------------------------------------------

  /** What nazir/06 opens with: the state `setNazirPermissions` writes. */
  async getNazirPermissions(
    madrasahId: string,
    userId: string
  ): Promise<MadrasahNazirPermissionsResponse> {
    const id = userId.toLowerCase();
    await this.mustBeNazir(madrasahId, id);
    return describeHeldGrants(await this.repo.heldTreeGrants(madrasahId, id));
  }

  /**
   * Nazir/06's Kaydet: the group, the single permissions, the courses they are
   * limited to and the end replace what the nazır held, and the nazır's row of
   * nazir/05 is answered.
   */
  async setNazirPermissions(
    user: AuthenticatedUser,
    madrasahId: string,
    userId: string,
    dto: SetMadrasahNazirPermissionsDto
  ): Promise<MadrasahNazirResponse> {
    const { id: actor } = await this.actor(user, madrasahId);
    const id = userId.toLowerCase();
    await this.mustBeNazir(madrasahId, id);
    // Nobody gives themselves permissions: the person the caller names is
    // never the caller (a person who is no nazır is still not found above).
    await this.selfGrant.assertNotSelf(
      user,
      [id],
      { entity: ENTITIES.MADRASAH, id: madrasahId },
      { always: true },
      "madrasah.nazir.permissions"
    );

    this.checkCodes(dto.permissions, ANY_CODE);
    const group = dto.groupId
      ? await this.mustFindGroup(madrasahId, dto.groupId)
      : null;
    const extras = extrasToStore(dto.permissions, group);
    const courseIds = dto.courseIds
      ? [...new Set(dto.courseIds.map((c) => c.toLowerCase()))]
      : null;

    const problem = courseScopeProblem(group, extras, courseIds);
    if (problem)
      throw new NazirCourseScopeError(COURSE_SCOPE_MESSAGES[problem]);
    if (courseIds) {
      const found = await this.repo.courseIdsOf(madrasahId, courseIds);
      const missing = courseIds.filter((c) => !found.includes(c));
      if (missing.length > 0) {
        throw new NazirCourseScopeError("Not a course of this medrese", {
          courseIds: missing,
        });
      }
    }

    const authority =
      (await this.authorityOf(user, madrasahId)) ?? SCOPE_TYPES.MADRASAH;
    await this.repo.setPermissions(madrasahId, id, actor, {
      authority,
      scopes: wantedScopes({
        madrasahId,
        group,
        permissions: extras,
        courseIds,
      }),
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    });
    const row = await this.nazirs.find(madrasahId, id);
    if (!row) throw new NazirNotFoundError(madrasahId, id);
    return row;
  }

  private async mustBeNazir(madrasahId: string, userId: string) {
    if ((await this.repo.heldRoles(madrasahId, userId)).length === 0) {
      throw new NazirNotFoundError(madrasahId, userId);
    }
  }
}
