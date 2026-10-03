import {
  AuthenticatedUser,
  AuthzForbiddenError,
  AuthzService,
  ROLES,
} from "@medaris/common";
import { Injectable, Logger } from "@nestjs/common";
import { GrantExpiryInvalidError } from "../assignment/admin/errors";
import { checkGrantExpiry } from "../assignment/admin/grant-plan";
import { KeycloakAdminService } from "../keycloak-admin/keycloak-admin.service";
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
import {
  KoskAlreadyHiddenError,
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
    private readonly keycloak: KeycloakAdminService
  ) {}

  // ---- who is asking -----------------------------------------------------------

  private requireChiefNazim(user: AuthenticatedUser, what: string): void {
    if (!this.authz.isSystemAdmin(user)) {
      throw new AuthzForbiddenError(`Only the Medaris başnazımı may ${what}`);
    }
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
      items: items.map((row) => this.presentRow(row, people)),
      total,
      page: query.page,
      limit: query.limit,
      counts,
      fields,
    };
  }

  /** The başnazım sees every köşk; a köşk nazımı their own; anyone else is refused. */
  private async scopeOf(user: AuthenticatedUser): Promise<string | undefined> {
    if (this.authz.isSystemAdmin(user)) return undefined;
    if (await this.koskService.managesAny(user.sub)) return user.sub;
    throw new AuthzForbiddenError(
      "The köşk table is for the Medaris başnazımı and köşk nazımları"
    );
  }

  private presentRow(
    row: IKoskDirectoryRow,
    people: Map<string, IPersonRow>
  ): KoskDirectoryItemResponse {
    const { nazimIds, ...rest } = row;
    return {
      ...rest,
      nazims: nazimIds.map((id) => this.person(id, people)),
    };
  }

  private async presentOne(koskId: string): Promise<KoskDirectoryItemResponse> {
    const row = await this.repo.findDirectoryItem(koskId);
    if (!row) throw new KoskNotFoundError(koskId);
    return this.presentRow(row, await this.resolvePeople(row.nazimIds));
  }

  // ---- nizam/24 and 09: hiding and bringing back ---------------------------------------

  /** `@Authz(EDIT)` on the route decided who may; this writes. */
  async hide(
    koskId: string,
    actorId: string
  ): Promise<KoskDirectoryItemResponse> {
    const outcome = await this.repo.hide(koskId, actorId);
    if (outcome === "no-kosk") throw new KoskNotFoundError(koskId);
    if (outcome === "already-hidden") throw new KoskAlreadyHiddenError(koskId);
    return this.presentOne(koskId);
  }

  async restore(
    user: AuthenticatedUser,
    koskId: string
  ): Promise<KoskDirectoryItemResponse> {
    this.requireChiefNazim(user, "bring a hidden köşk back");
    const outcome = await this.repo.restore(koskId, user.sub);
    if (outcome === "no-kosk") throw new KoskNotFoundError(koskId);
    if (outcome === "not-hidden") throw new KoskNotHiddenError(koskId);
    return this.presentOne(koskId);
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
    this.requireChiefNazim(user, "add köşk nazımları");
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
    this.requireChiefNazim(user, "open a köşk with nazımları");
    const { managerUserIds, ...kosk } = dto;
    const nazimIds = (managerUserIds ?? []).map((id) => id.toLowerCase());
    await this.koskService.assertHandleFree(kosk.handle);
    await this.assertKnownAccounts(nazimIds);
    return this.repo.createWithNazims({ ownerId: user.sub, ...kosk }, nazimIds);
  }
}
