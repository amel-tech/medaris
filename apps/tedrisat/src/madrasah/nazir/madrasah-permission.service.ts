import {
  type AuthenticatedUser,
  AuthzService,
  ENTITIES,
  type IEffective,
  type IGrantHolding,
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
import { GrantExceedsGiverError } from "../../kosk/errors/kosk-grants-errors";
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
import { madrasahAuthorityOf } from "./madrasah-authority";
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

/** Something being given: these codes, in this scope. */
interface IGiven {
  scopeType: ScopeType;
  scopeId: string;
  codes: readonly string[];
}

/**
 * What a giver holds somewhere: the codes, and the grants that carry them,
 * each with its authority and how long it is held.
 */
interface IHoldings {
  codes: ReadonlySet<string>;
  grants: ReadonlyMap<string, readonly IGrantHolding[]>;
}

function holdingsFrom(effective: IEffective | null): IHoldings {
  return {
    codes: new Set<string>(effective?.codes ?? []),
    grants: effective?.grantHoldings ?? new Map(),
  };
}

/** The kademe, lowest first: course < medrese < köşk < platform (owner, 29 September). */
export const KADEME: Record<ScopeType, number> = {
  [SCOPE_TYPES.COURSE]: 0,
  [SCOPE_TYPES.MADRASAH]: 1,
  [SCOPE_TYPES.KOSK]: 2,
  [SCOPE_TYPES.PLATFORM]: 3,
};

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
   * `platform.madrasah_nazir_grant` gives as the platform. How much they may
   * give is `holdingsCheck`'s: only what they hold themselves in the
   * medrese (owner, MDRS-209: "kendi izinleriyle sınırlı elbette"), and every
   * grant, group change and appointment is written to the audit log with its
   * level and is listed to the başnazım under what they handed on. Asked of the
   * engine, so the screens, the guard and this check cannot disagree.
   */
  private authorityOf(
    user: AuthenticatedUser,
    madrasahId: string
  ): Promise<ScopeType | null> {
    return madrasahAuthorityOf(this.authz, user, madrasahId);
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

  /**
   * The ceiling: nobody hands on what they do not hold themselves in this
   * medrese. Returns null for the başnazım, who is not asked, and otherwise a
   * check over what is about to be given (a grant or a group's codes, with the
   * scope it lands in) that throws `GRANT_EXCEEDS_GIVER`, naming the codes that
   * exceed what the caller holds. The caller's own effective permissions, on
   * the medrese and in every course below it, must contain each code:
   *
   * - the başmüderris holds every medrese and course code by role default, so
   *   for them it asks nothing;
   * - a Medaris nazımı's own default is empty, so what they may give is what
   *   the başnazım gave them: codes held at this medrese (they were seated as
   *   a nazır here and given them) and course codes given "for every course".
   *   A Medaris nazımı with none of those appoints and gives nothing, which is
   *   intended (owner, MDRS-209: "kendi izinleriyle sınırlı elbette");
   * - a grant limited to some courses may also rest on the giver holding the
   *   code in each of those courses.
   *
   * `candidates` is every scope and code the request may touch: it only decides
   * which courses' holdings are read, so the check itself stays synchronous and
   * can run inside the write's transaction on exactly the rows it inserts.
   */
  /** What the caller holds in the medrese and in every course below it; null for the başnazım, who holds no limit. */
  private async holdingsOf(
    user: AuthenticatedUser,
    madrasahId: string
  ): Promise<IHoldings | null> {
    if (this.authz.isSystemAdmin(user)) return null;
    return holdingsFrom(
      await this.authz.effective(
        user,
        { entity: ENTITIES.MADRASAH, id: madrasahId },
        { acrossCourses: true }
      )
    );
  }

  private async holdingsCheck(
    user: AuthenticatedUser,
    madrasahId: string,
    candidates: ReadonlyArray<IGiven>
  ): Promise<((given: readonly IGiven[]) => void) | null> {
    return (
      (await this.giverLimits(user, madrasahId, candidates))?.check ?? null
    );
  }

  /**
   * The ceiling (`check`) and the cap on the authority a handed-on row is
   * stored with (`authorityFor`), from the same reads; null for the başnazım,
   * who has neither. The cap is the giver's own holding of the row's codes
   * (owner, d-1004-27 "tavan kazanır"): a code they hold through a grant
   * passes on with that grant's authority at most, one they hold through a
   * role or a relationship with the medrese's own level, which no policy above
   * it lets through. A grant counts only if the giver holds it for as long as
   * the row is given (`expiresAt`, null for no end): an authority they hold
   * until tomorrow does not go on a row that runs past it. So a gift never
   * carries past a policy what does not carry the giver past it, then or
   * later.
   */
  private async giverLimits(
    user: AuthenticatedUser,
    madrasahId: string,
    candidates: ReadonlyArray<IGiven>
  ): Promise<{
    check: (given: readonly IGiven[]) => void;
    authorityFor: (
      given: IGiven,
      acting: ScopeType,
      expiresAt: Date | null
    ) => ScopeType;
  } | null> {
    const held = await this.holdingsOf(user, madrasahId);
    if (held === null) return null;
    const inCourse = new Map<string, IHoldings>();
    for (const scope of candidates) {
      if (
        scope.scopeType !== SCOPE_TYPES.COURSE ||
        inCourse.has(scope.scopeId) ||
        scope.codes.every((code) => held.codes.has(code))
      ) {
        continue;
      }
      inCourse.set(
        scope.scopeId,
        holdingsFrom(
          await this.authz.effective(user, {
            entity: ENTITIES.COURSE,
            id: scope.scopeId,
          })
        )
      );
    }
    const holdingsFor = (scope: IGiven) =>
      scope.scopeType === SCOPE_TYPES.COURSE
        ? [held, inCourse.get(scope.scopeId)]
        : [held];
    return {
      check: (given) => {
        const exceeding = new Set<string>();
        for (const scope of given) {
          for (const code of scope.codes) {
            if (!holdingsFor(scope).some((h) => h?.codes.has(code))) {
              exceeding.add(code);
            }
          }
        }
        if (exceeding.size > 0) {
          throw new GrantExceedsGiverError([...exceeding].sort(), {
            madrasahId,
          });
        }
      },
      authorityFor: (scope, acting, expiresAt) => {
        const lasts = (until: Date | null) =>
          until === null ||
          (expiresAt !== null && until.getTime() >= expiresAt.getTime());
        let cap = acting;
        for (const code of scope.codes) {
          const mine = holdingsFor(scope).flatMap((h) =>
            (h?.grants.get(code) ?? [])
              .filter((grant) => lasts(grant.until))
              .map((grant) => grant.authority)
          );
          const best = mine.reduce<ScopeType>(
            (a, b) => (KADEME[b] > KADEME[a] ? b : a),
            SCOPE_TYPES.MADRASAH
          );
          if (KADEME[best] < KADEME[cap]) cap = best;
        }
        return cap;
      },
    };
  }

  // ---- the dictionary and the groups -------------------------------------

  async catalog(
    user: AuthenticatedUser,
    madrasahId: string
  ): Promise<MadrasahPermissionCatalogResponse> {
    // What the editor lets them tick: the lists, cut to the caller's own
    // holdings, so the screens and the write refuse the same codes.
    const all = [...MADRASAH_CATALOG, ...MADRASAH_COURSE_CATALOG];
    const held = (await this.mayGive(user, madrasahId))
      ? await this.holdingsOf(user, madrasahId)
      : holdingsFrom(null);
    return {
      madrasah: [...MADRASAH_CATALOG],
      course: [...MADRASAH_COURSE_CATALOG],
      givable: held === null ? all : all.filter((code) => held.codes.has(code)),
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
    const given: IGiven[] = [
      {
        scopeType: SCOPE_TYPES.MADRASAH,
        scopeId: madrasahId,
        codes: permissions,
      },
    ];
    (await this.holdingsCheck(user, madrasahId, given))?.(given);
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
    // A change to a group somebody holds detaches them first (`usersPolicy`:
    // they keep the old codes as single permissions, or nothing), so the new
    // codes reach only whoever is given the group from now on. What a change
    // adds is still held to the ceiling, since giving the group hands it on;
    // what it takes away, and a rename, is not a gift.
    const added: IGiven[] = [
      {
        scopeType: SCOPE_TYPES.MADRASAH,
        scopeId: madrasahId,
        codes: permissions.filter((code) => !group.permissions.includes(code)),
      },
    ];
    (await this.holdingsCheck(user, madrasahId, added))?.(added);
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
    const { id: actor, authority } = await this.actor(user, madrasahId);
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

    const scopes = wantedScopes({
      madrasahId,
      group,
      permissions: extras,
      courseIds,
    });
    // Everything the request may hand on, by scope: its single permissions
    // and, where a group sits, the group's codes. The ceiling is checked inside
    // the write, on what it really inserts or re-times (a code the nazır
    // already holds from someone else and keeps is not a gift), with a group's
    // codes read under the group's lock there, not the ones read above.
    const codesIn = (scope: (typeof scopes)[number]): string[] => [
      ...scope.permissions,
      ...(scope.groupId && group ? group.permissions : []),
    ];
    const limits = await this.giverLimits(
      user,
      madrasahId,
      scopes.map((scope) => ({
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        codes: codesIn(scope),
      }))
    );
    await this.repo.setPermissions(madrasahId, id, actor, {
      authority,
      scopes,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      ceiling: limits ? (given) => limits.check(given) : undefined,
      // A gift never carries an authority the giver's own holding lacks
      // (d-1004-27), so the receiver gets past no policy the giver cannot.
      authorityFor: limits
        ? (row, expiresAt) => limits.authorityFor(row, authority, expiresAt)
        : undefined,
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
