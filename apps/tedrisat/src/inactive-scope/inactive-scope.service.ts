import {
  ASSIGNED_ROLES,
  AuthenticatedUser,
  AuthzForbiddenError,
  AuthzService,
  ENTITIES,
  ROLES,
  SelfGrantGuard,
} from "@medaris/common";
import { Injectable, Logger } from "@nestjs/common";
import { GrantExpiryInvalidError } from "../assignment/admin/errors";
import { checkGrantExpiry } from "../assignment/admin/grant-plan";
import { PERMISSIONS } from "../assignment/permission-catalog";
import { KeycloakAdminService } from "../keycloak-admin/keycloak-admin.service";
import { KoskNazimUnknownAccountError } from "../kosk/errors/kosk-admin-errors";
import { MadrasahService } from "../madrasah/madrasah.service";
import { InactiveScopeNotFoundError } from "./errors";
import type {
  AssignInactiveScopeDto,
  InactivePersonResponse,
  InactiveScopeResponse,
} from "./inactive-scope.dto";
import {
  InactiveScopeRepository,
  type IPersonRow,
} from "./inactive-scope.repository";
import {
  endedAt,
  endReason,
  INACTIVE_SCOPE_TYPES,
  type InactiveScopeType,
} from "./inactive-scope.rules";

const nameOf = (row: IPersonRow | undefined): string | null =>
  [row?.givenName, row?.familyName].filter(Boolean).join(" ").trim() || null;

/**
 * The Pasif kapsamlar page (MDRS-172, nizam/14): köşks, medreses and courses
 * whose last manager is gone — the term ran out, or somebody took the post
 * away. Open to the Medaris başnazımı and to a Medaris nazımı who holds
 * "Pasif kapsamları yönet"; everything else is a 403, which the web app shows
 * as nizam/06.
 */
@Injectable()
export class InactiveScopeService {
  private readonly logger = new Logger(InactiveScopeService.name);

  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: InactiveScopeRepository,
    private readonly authz: AuthzService,
    private readonly keycloak: KeycloakAdminService,
    private readonly madrasahService: MadrasahService,
    private readonly selfGrant: SelfGrantGuard
  ) {}

  private async actor(user: AuthenticatedUser): Promise<string> {
    if (this.authz.isSystemAdmin(user)) return user.sub;
    if (
      await this.repo.holdsPlatformPermission(
        user.sub,
        PERMISSIONS.PLATFORM_INACTIVE_SCOPES_MANAGE
      )
    ) {
      return user.sub;
    }
    throw new AuthzForbiddenError(
      "Only the Medaris başnazımı and a Medaris nazımı who may manage passive scopes open this page"
    );
  }

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
  ): InactivePersonResponse {
    const row = people.get(id);
    return { id, name: nameOf(row), email: row?.email ?? null };
  }

  /** The realm's başnazımlar, or none when the directory cannot be read. */
  private async chiefIds(viewer: AuthenticatedUser): Promise<Set<string>> {
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
    return chief;
  }

  /**
   * The same scopes as `list`, without the people (MDRS-182, nizam/01 and 05):
   * the home page's count and its Pasif kapsamlar card need the name, the kind,
   * the reason and the date, and no directory call. Oldest first, like `list`.
   * No permission check here: the caller decides what to show whom.
   */
  async brief(): Promise<
    {
      type: InactiveScopeType;
      id: string;
      name: string;
      koskName: string | null;
      reason: ReturnType<typeof endReason>;
      since: Date;
    }[]
  > {
    const found = await Promise.all(
      INACTIVE_SCOPE_TYPES.map(async (type) => {
        const posts = await this.repo.lastPosts(type);
        const scopes = await this.repo.scopeInfo(
          type,
          posts.map((p) => p.scopeId)
        );
        return posts.flatMap((post) => {
          const scope = scopes.get(post.scopeId);
          const since = endedAt(post);
          return scope && since
            ? [
                {
                  type,
                  id: scope.id,
                  name: scope.name,
                  koskName: scope.kosk?.name ?? null,
                  reason: endReason(post),
                  since,
                },
              ]
            : [];
        });
      })
    );
    return found.flat().sort((a, b) => a.since.getTime() - b.since.getTime());
  }

  async list(
    user: AuthenticatedUser,
    type?: InactiveScopeType
  ): Promise<InactiveScopeResponse[]> {
    await this.actor(user);
    const types = type ? [type] : [...INACTIVE_SCOPE_TYPES];
    const found = await Promise.all(
      types.map(async (t) => {
        const posts = await this.repo.lastPosts(t);
        const scopes = await this.repo.scopeInfo(
          t,
          posts.map((p) => p.scopeId)
        );
        return posts.flatMap((post) => {
          const scope = scopes.get(post.scopeId);
          const since = endedAt(post);
          return scope && since ? [{ t, post, scope, since }] : [];
        });
      })
    );
    const entries = found.flat();
    const ids = entries.flatMap((e) => [
      e.post.userId,
      ...(e.post.revokedBy ? [e.post.revokedBy] : []),
    ]);
    const [people, chief, ever] = await Promise.all([
      this.resolvePeople(ids),
      this.chiefIds(user),
      this.repo.everRoles(ids),
    ]);
    return entries
      .map(({ t, post, scope, since }): InactiveScopeResponse => {
        const reason = endReason(post);
        const remover = reason === "REMOVED" ? post.revokedBy : null;
        const koskId = scope.kosk?.id ?? (t === "KOSK" ? scope.id : null);
        return {
          type: t,
          id: scope.id,
          name: scope.name,
          kosk: scope.kosk,
          reason,
          since,
          lastManager: this.person(post.userId, people),
          lastRole: post.role,
          wasImam: post.isImam,
          removedBy: remover ? this.person(remover, people) : null,
          removedByRole: !remover
            ? null
            : chief.has(remover)
              ? "SYSTEM_ADMIN"
              : koskId && ever.koskNazim.get(remover)?.has(koskId)
                ? "KOSK_NAZIM"
                : ever.medaris.has(remover)
                  ? "MEDARIS_NAZIM"
                  : null,
        };
      })
      .sort(
        (a, b) =>
          a.since.getTime() - b.since.getTime() || a.id.localeCompare(b.id)
      );
  }

  private async mustBeInactive(
    type: InactiveScopeType,
    id: string
  ): Promise<void> {
    if (!(await this.repo.isInactive(type, id))) {
      throw new InactiveScopeNotFoundError(type, id);
    }
  }

  /** "Başmüderris ata", "Köşk nazımı ata", "Müderris ata": the scope is attended again. */
  async assign(
    user: AuthenticatedUser,
    type: InactiveScopeType,
    id: string,
    dto: AssignInactiveScopeDto
  ): Promise<void> {
    const actorId = await this.actor(user);
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (checkGrantExpiry(endsAt, null, new Date()) === "past") {
      throw new GrantExpiryInvalidError("The end date is in the past");
    }
    await this.mustBeInactive(type, id);
    const userId = dto.userId.toLowerCase();
    // Platform management attends a passive scope for someone else: it does
    // not seat itself in the post.
    await this.selfGrant.assertNotSelf(
      user,
      [userId],
      {
        entity:
          type === "MADRASAH"
            ? ENTITIES.MADRASAH
            : type === "KOSK"
              ? ENTITIES.KOSK
              : ENTITIES.COURSE,
        id,
      },
      {
        role:
          type === "MADRASAH"
            ? ASSIGNED_ROLES.MEDRESE_BASMUDERRIS
            : type === "KOSK"
              ? ASSIGNED_ROLES.KOSK_NAZIM
              : ASSIGNED_ROLES.MUDERRIS,
        always: true,
      },
      "inactive_scope.assign"
    );
    const people = await this.resolvePeople([userId]);
    if (!people.has(userId)) throw new KoskNazimUnknownAccountError(userId);
    if (type === "MADRASAH") {
      await this.madrasahService.setHeadMuderris(id, userId, actorId, {
        endsAt,
      });
      return;
    }
    await this.repo.assign(actorId, type, id, {
      userId,
      endsAt,
      displayName:
        nameOf(people.get(userId)) ?? people.get(userId)?.email ?? userId,
    });
  }

  /** "İçeriği gör": the opening is written to the audit log; the page itself is the web app's. */
  async view(
    user: AuthenticatedUser,
    type: InactiveScopeType,
    id: string
  ): Promise<void> {
    const actorId = await this.actor(user);
    await this.mustBeInactive(type, id);
    await this.repo.recordView(actorId, type, id);
  }
}
