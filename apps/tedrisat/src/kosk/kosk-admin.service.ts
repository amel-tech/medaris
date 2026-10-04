import {
  AuthenticatedUser,
  AuthzForbiddenError,
  AuthzService,
  ENTITIES,
  PERMISSIONS,
  type PermissionCode,
  ROLES,
} from "@medaris/common";
import { Injectable, Logger } from "@nestjs/common";
import {
  actingLevel,
  COURSE_HIDE_LADDER,
  hiderLevelOf,
  KOSK_HIDE_LADDER,
  mayRestoreHidden,
} from "../archive/hide-level";
import { GrantExpiryInvalidError } from "../assignment/admin/errors";
import { checkGrantExpiry } from "../assignment/admin/grant-plan";
import { SCOPE_TYPES } from "../database/schema/scope-type.schema";
import { KeycloakAdminService } from "../keycloak-admin/keycloak-admin.service";
import type {
  PassivateScopeDto,
  PassivationImpactResponse,
} from "../passivation/dto/passivation.dto";
import { presentImpact } from "../passivation/passivation-impact";
import { PassivationImpactRepository } from "../passivation/passivation-impact.repository";
import type { CreateKoskDto } from "./dto/create-kosk.dto";
import type {
  AddKoskNazimsDto,
  KoskDirectoryItemResponse,
  KoskDirectoryResponse,
  KoskListingFilter,
  KoskNazimGranterRole,
  KoskNazimResponse,
  KoskPersonResponse,
  KoskStatusFilter,
} from "./dto/kosk-admin.dto";
import type {
  KoskCourseRosterResponse,
  KoskOverviewResponse,
} from "./dto/kosk-overview.dto";
import {
  KoskAlreadyHiddenError,
  KoskAlreadyPassiveError,
  KoskNazimExistsError,
  KoskNazimUnknownAccountError,
  KoskNotHiddenError,
} from "./errors/kosk-admin-errors";
import { KoskNotFoundError } from "./errors/kosk-not-found.error";
import type { IKosk } from "./kosk.repository.interface";
import { KoskService } from "./kosk.service";
import {
  type IKoskDirectoryRow,
  type IPersonRow,
  KoskAdminRepository,
} from "./kosk-admin.repository";

export interface IDirectoryQuery {
  status: KoskStatusFilter;
  level?: string;
  field?: string;
  listing: KoskListingFilter;
  q?: string;
  page: number;
  limit: number;
}

const nameOf = (row: IPersonRow | undefined): string | null => {
  const name = [row?.givenName, row?.familyName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || null;
};

/**
 * The köşk screens of the Medaris yönetimi (MDRS-174, nizam/09, 10, 21, 24,
 * 25). Opening a köşk with its nazımları, adding nazımları, listing every köşk
 * and bringing a hidden one back are the Medaris başnazımı's (SYSTEM_ADMIN)
 * alone, like the medrese screens before them; a köşk's nazımları read their
 * own table and nazım list and may hide their köşk.
 */
@Injectable()
export class KoskAdminService {
  private readonly logger = new Logger(KoskAdminService.name);

  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: KoskAdminRepository,
    private readonly koskService: KoskService,
    private readonly authz: AuthzService,
    private readonly keycloak: KeycloakAdminService,
    private readonly impact: PassivationImpactRepository
  ) {}

  // ---- who is asking -----------------------------------------------------------

  /**
   * The Medaris management gate (MDRS-135): the başnazım passes, and so does a
   * Medaris nazımı who was given the platform permission for it — asked of the
   * engine, so a grant, its group and its end are read the way every other
   * route reads them.
   */
  private async requirePlatform(
    user: AuthenticatedUser,
    code: PermissionCode,
    what: string
  ): Promise<void> {
    if (this.authz.isSystemAdmin(user)) return;
    if (
      await this.authz.can(user, { entity: ENTITIES.KOSK, id: "any" }, code)
    ) {
      return;
    }
    throw new AuthzForbiddenError(
      `Only the Medaris başnazımı and a Medaris nazımı holding ${code} may ${what}`
    );
  }

  // ---- names ---------------------------------------------------------------------

  /**
   * Names for the people a screen lists: the users table first (written at
   * sign-in), then the realm's directory for anyone who never signed in — a
   * freshly appointed nazım is exactly that. An unreachable directory is not
   * an error here; the person just has no name.
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

  private person(
    id: string,
    people: Map<string, IPersonRow>
  ): KoskPersonResponse {
    const row = people.get(id);
    return { id, name: nameOf(row), email: row?.email ?? null };
  }

  // ---- nizam/09: the table ----------------------------------------------------------

  async directory(
    user: AuthenticatedUser,
    query: IDirectoryQuery
  ): Promise<KoskDirectoryResponse> {
    const managerId = await this.scopeOf(user);
    const { items, total } = await this.repo.findDirectory(
      { ...query, managerId },
      query.limit,
      (query.page - 1) * query.limit
    );
    const [counts, fields, people] = await Promise.all([
      this.repo.statusCounts(managerId),
      this.repo.fieldsInUse(managerId),
      this.resolvePeople(items.flatMap((i) => i.nazimIds)),
    ]);
    return {
      items: await Promise.all(
        items.map((row) => this.presentRow(user, row, people))
      ),
      total,
      page: query.page,
      limit: query.limit,
      counts,
      fields,
    };
  }

  /**
   * The başnazım sees every köşk, and so does a Medaris nazımı holding any of
   * the platform's köşk permissions; a köşk nazımı sees their own; anyone else
   * is refused.
   */
  private async scopeOf(user: AuthenticatedUser): Promise<string | undefined> {
    if (this.authz.isSystemAdmin(user)) return undefined;
    if (
      await this.authz.can(user, { entity: ENTITIES.KOSK, id: "any" }, [
        PERMISSIONS.PLATFORM_KOSK_CREATE,
        PERMISSIONS.PLATFORM_KOSK_EDIT,
        PERMISSIONS.PLATFORM_KOSK_NAZIM_MANAGE,
        PERMISSIONS.PLATFORM_HOSTING_GRANT,
      ])
    ) {
      return undefined;
    }
    if (await this.koskService.managesAny(user.sub)) return user.sub;
    throw new AuthzForbiddenError(
      "The köşk table is for the Medaris başnazımı and köşk nazımları"
    );
  }

  /**
   * A row as the table draws it. `canRestore` is whether the caller may bring a
   * hidden köşk back, by the same ladder and kademe the restore asks, so the
   * "Geri al" button is shown to exactly the people it will work for.
   */
  private async presentRow(
    user: AuthenticatedUser,
    row: IKoskDirectoryRow,
    people: Map<string, IPersonRow>
  ): Promise<KoskDirectoryItemResponse> {
    const { nazimIds, ...rest } = row;
    return {
      ...rest,
      nazims: nazimIds.map((id) => this.person(id, people)),
      canRestore:
        row.hiddenLevel !== null &&
        (await mayRestoreHidden(
          this.authz,
          user,
          { entity: ENTITIES.KOSK, id: row.id },
          KOSK_HIDE_LADDER,
          row.hiddenLevel
        )),
    };
  }

  private async presentOne(
    user: AuthenticatedUser,
    koskId: string
  ): Promise<KoskDirectoryItemResponse> {
    const row = await this.repo.findDirectoryItem(koskId);
    if (!row) throw new KoskNotFoundError(koskId);
    return this.presentRow(user, row, await this.resolvePeople(row.nazimIds));
  }

  // ---- nizam/24 and 09: hiding and bringing back ---------------------------------------

  /** `@Authz([kosk.manage, platform.kosk_edit])` on the route decided who may; this writes. */
  async hide(
    koskId: string,
    user: AuthenticatedUser
  ): Promise<KoskDirectoryItemResponse> {
    const level = await actingLevel(
      this.authz,
      user,
      { entity: ENTITIES.KOSK, id: koskId },
      KOSK_HIDE_LADDER,
      SCOPE_TYPES.KOSK
    );
    const outcome = await this.repo.hide(koskId, user.sub, level);
    if (outcome === "no-kosk") throw new KoskNotFoundError(koskId);
    if (outcome === "already-hidden") throw new KoskAlreadyHiddenError(koskId);
    return this.presentOne(user, koskId);
  }

  async restore(
    user: AuthenticatedUser,
    koskId: string
  ): Promise<KoskDirectoryItemResponse> {
    // The başnazım and a Medaris nazımı holding `platform.kosk_edit` act as the
    // platform, the köşk's own nazımı as the köşk; the repository then refuses
    // a restore by a lower level than the one that hid it.
    const level = await actingLevel(
      this.authz,
      user,
      { entity: ENTITIES.KOSK, id: koskId },
      KOSK_HIDE_LADDER,
      null
    );
    if (level === null) {
      throw new AuthzForbiddenError(
        `Only the köşk's nazımı, the Medaris başnazımı and a Medaris nazımı holding ${PERMISSIONS.PLATFORM_KOSK_EDIT} may bring a hidden köşk back`
      );
    }
    const outcome = await this.repo.restore(koskId, user.sub, level);
    if (outcome === "no-kosk") throw new KoskNotFoundError(koskId);
    if (outcome === "not-hidden") throw new KoskNotHiddenError(koskId);
    return this.presentOne(user, koskId);
  }

  // ---- nizam/20 and 23: the köşk page, its courses, taking it out of service ----

  /** `@Authz([kosk.manage, platform.kosk_edit])` on the route decided who may read. */
  async overview(
    user: AuthenticatedUser,
    koskId: string
  ): Promise<KoskOverviewResponse> {
    const row = await this.repo.overview(koskId);
    if (!row) throw new KoskNotFoundError(koskId);
    const { ownerId, ...rest } = row;
    const people = await this.resolvePeople([ownerId]);
    return {
      ...rest,
      openedBy: this.person(ownerId, people),
      canRestore:
        row.hiddenLevel !== null &&
        (await mayRestoreHidden(
          this.authz,
          user,
          { entity: ENTITIES.KOSK, id: koskId },
          KOSK_HIDE_LADDER,
          row.hiddenLevel
        )),
    };
  }

  /**
   * The Dersler table. A hidden course says the level that hid it and whether
   * the caller may bring it back (`COURSE_HIDE_LADDER`, as `POST
   * /courses/:id/restore` decides), so the table offers "Geri al" only where the
   * API would accept it and a köşk nazımı is not shown it for a course the
   * platform hid (MDRS-108, MDRS-143).
   */
  async courseRoster(
    user: AuthenticatedUser,
    koskId: string
  ): Promise<KoskCourseRosterResponse> {
    if (!(await this.repo.koskName(koskId))) {
      throw new KoskNotFoundError(koskId);
    }
    const rows = await this.repo.courseRoster(koskId);
    const items = await Promise.all(
      rows.map(async ({ hiddenLevel: recorded, ...row }) => {
        if (row.status !== "HIDDEN") {
          return { ...row, hiddenLevel: null, canRestore: false };
        }
        const hiddenLevel = hiderLevelOf({
          type: "course",
          madrasahId: row.madrasah?.id ?? null,
          archivedLevel: recorded,
        });
        return {
          ...row,
          hiddenLevel,
          canRestore: await mayRestoreHidden(
            this.authz,
            user,
            { entity: ENTITIES.COURSE, id: row.id },
            COURSE_HIDE_LADDER,
            hiddenLevel
          ),
        };
      })
    );
    return {
      items,
      counts: {
        all: items.length,
        published: items.filter((i) => i.status === "PUBLISHED").length,
        draft: items.filter((i) => i.status === "DRAFT").length,
        hidden: items.filter((i) => i.status === "HIDDEN").length,
      },
    };
  }

  /**
   * What "Köşkü pasife al" takes along, with the confirmation to post back
   * (MDRS-227). `@Authz(platform.kosk_edit)` on the route decided who may read.
   */
  async previewDeactivation(
    user: AuthenticatedUser,
    koskId: string
  ): Promise<PassivationImpactResponse> {
    const impact = await this.impact.measure({ type: "KOSK", id: koskId });
    if (!impact) throw new KoskNotFoundError(koskId);
    return presentImpact(impact, user.sub);
  }

  /** `@Authz(platform.kosk_edit)` on the route decided who may; the confirmation is checked under the row lock. */
  async deactivate(
    user: AuthenticatedUser,
    koskId: string,
    dto: PassivateScopeDto
  ): Promise<KoskDirectoryItemResponse> {
    const outcome = await this.repo.deactivate(
      koskId,
      user.sub,
      dto.confirmation
    );
    if (outcome === "no-kosk") throw new KoskNotFoundError(koskId);
    if (outcome === "already-passive") {
      throw new KoskAlreadyPassiveError(koskId);
    }
    return this.presentOne(user, koskId);
  }

  // ---- nizam/25 and 21: the nazımları ------------------------------------------------------

  async listNazims(
    user: AuthenticatedUser,
    koskId: string
  ): Promise<KoskNazimResponse[]> {
    const rows = await this.repo.heldNazims(koskId);
    const ids = rows.flatMap((r) => [r.userId, r.grantedBy]);
    const [people, roles] = await Promise.all([
      this.resolvePeople(ids),
      this.grantorRoles(
        user,
        koskId,
        rows.map((r) => r.grantedBy)
      ),
    ]);
    return rows.map((r) => ({
      user: this.person(r.userId, people),
      grantedBy: this.person(r.grantedBy, people),
      grantedByRole: roles.get(r.grantedBy) ?? null,
      grantedAt: r.grantedAt,
      endsAt: r.endsAt,
    }));
  }

  /**
   * What the giver is, worked out at read time because `role_assignments`
   * keeps who gave but not in which capacity: the realm's başnazım (the
   * SYSTEM_ADMIN role), then a nazım of this köşk (a held or a past row), then
   * a Medaris nazımı. Anyone the directory cannot place is `null`.
   */
  private async grantorRoles(
    viewer: AuthenticatedUser,
    koskId: string,
    grantors: string[]
  ): Promise<Map<string, KoskNazimGranterRole | null>> {
    const ids = [...new Set(grantors)];
    const result = new Map<string, KoskNazimGranterRole | null>();
    if (ids.length === 0) return result;
    const chief = new Set<string>();
    if (this.authz.isSystemAdmin(viewer)) chief.add(viewer.sub);
    if (this.keycloak.isConfigured()) {
      try {
        for (const holder of await this.keycloak.findByRealmRole(
          ROLES.SYSTEM_ADMIN
        )) {
          chief.add(holder.id);
        }
      } catch {
        this.logger.warn("The başnazım could not be read from the directory");
      }
    }
    const [ever, medaris] = await Promise.all([
      this.repo.everNazimsOf(koskId, ids),
      this.repo.medarisNazimsAmong(ids),
    ]);
    for (const id of ids) {
      result.set(
        id,
        chief.has(id)
          ? "SYSTEM_ADMIN"
          : ever.has(id)
            ? "KOSK_NAZIM"
            : medaris.has(id)
              ? "MEDARIS_NAZIM"
              : null
      );
    }
    return result;
  }

  /** The accounts must exist: in the users table or in the realm. */
  private async assertKnownAccounts(userIds: string[]): Promise<void> {
    const known = await this.repo.people(userIds);
    for (const id of userIds) {
      if (known.has(id)) continue;
      const inRealm = this.keycloak.isConfigured()
        ? await this.keycloak.findById(id)
        : null;
      if (!inRealm) throw new KoskNazimUnknownAccountError(id);
    }
  }

  async addNazims(
    user: AuthenticatedUser,
    koskId: string,
    dto: AddKoskNazimsDto
  ): Promise<KoskNazimResponse[]> {
    await this.requirePlatform(
      user,
      PERMISSIONS.PLATFORM_KOSK_NAZIM_MANAGE,
      "add köşk nazımları"
    );
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (checkGrantExpiry(endsAt, null, new Date()) === "past") {
      throw new GrantExpiryInvalidError("The end date is in the past");
    }
    const userIds = dto.userIds.map((id) => id.toLowerCase());
    await this.assertKnownAccounts(userIds);
    const outcome = await this.repo.addNazims(
      koskId,
      user.sub,
      userIds,
      endsAt
    );
    if (outcome.status === "no-kosk") throw new KoskNotFoundError(koskId);
    if (outcome.status === "exists") {
      throw new KoskNazimExistsError(koskId, outcome.userIds);
    }
    return this.listNazims(user, koskId);
  }

  // ---- nizam/10: opening a köşk ------------------------------------------------------------

  /**
   * "Köşk aç" with nazımları: SYSTEM_ADMIN's. The köşk is opened in the
   * caller's name and the caller is not one of its nazımları.
   */
  async createWithNazims(
    user: AuthenticatedUser,
    dto: CreateKoskDto
  ): Promise<IKosk> {
    await this.requirePlatform(
      user,
      PERMISSIONS.PLATFORM_KOSK_CREATE,
      "open a köşk with nazımları"
    );
    const { managerUserIds, ...kosk } = dto;
    const nazimIds = managerUserIds.map((id) => id.toLowerCase());
    await this.koskService.assertHandleFree(kosk.handle);
    await this.assertKnownAccounts(nazimIds);
    return this.repo.createWithNazims({ ownerId: user.sub, ...kosk }, nazimIds);
  }
}
