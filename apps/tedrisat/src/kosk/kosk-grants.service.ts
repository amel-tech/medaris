import {
  AuthenticatedUser,
  AuthzForbiddenError,
  AuthzService,
} from "@medaris/common";
import { Injectable, Logger } from "@nestjs/common";
import {
  GrantExpiryInvalidError,
  UnknownPermissionError,
} from "../assignment/admin/errors";
import { checkGrantExpiry } from "../assignment/admin/grant-plan";
import {
  COURSE_CATALOG,
  ROLE_DEFAULT_PERMISSIONS,
} from "../assignment/permission-catalog";
import {
  ASSIGNED_ROLES,
  SCOPE_TYPES,
  type ScopeType,
} from "../database/schema/role-assignment.schema";
import { KeycloakAdminService } from "../keycloak-admin/keycloak-admin.service";
import type { KoskPersonResponse } from "./dto/kosk-admin.dto";
import type {
  CreateKoskGrantDto,
  KoskGrantResponse,
  KoskGrantsResponse,
  UpdateKoskGrantDto,
} from "./dto/kosk-grants.dto";
import { KoskNazimUnknownAccountError } from "./errors/kosk-admin-errors";
import { GrantExceedsGiverError } from "./errors/kosk-grants-errors";
import {
  type IGrantPersonRow,
  KoskGrantsRepository,
} from "./kosk-grants.repository";
import { checkRequestedCodes, grantableCourseCodes } from "./kosk-grants-rules";

const nameOf = (row: IGrantPersonRow | undefined): string | null =>
  [row?.givenName, row?.familyName].filter(Boolean).join(" ").trim() || null;

/**
 * The köşk's İzinler page (MDRS-172, nizam/38): the köşk nazımı makes ders
 * nazırları in the köşk's medrese-free courses and gives them course
 * permissions, none beyond their own. The route's `@Authz(course_nazir.assign_kosk)` decides who
 * may open the page (a nazım of the köşk, and the başnazım); this decides what
 * they may hand out.
 */
@Injectable()
export class KoskGrantsService {
  private readonly logger = new Logger(KoskGrantsService.name);

  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: KoskGrantsRepository,
    private readonly authz: AuthzService,
    private readonly keycloak: KeycloakAdminService
  ) {}

  /**
   * The level the caller gives permissions at (MDRS-135): the başnazım as the
   * platform, a köşk nazımı as the köşk. A grant made from above a policy's
   * level survives that policy.
   */
  private authorityOf(user: AuthenticatedUser): ScopeType {
    return this.authz.isSystemAdmin(user)
      ? SCOPE_TYPES.PLATFORM
      : SCOPE_TYPES.KOSK;
  }

  /** The course permission codes the caller may hand out in this köşk. */
  private async grantable(
    user: AuthenticatedUser,
    koskId: string
  ): Promise<readonly string[]> {
    if (this.authz.isSystemAdmin(user)) return COURSE_CATALOG;
    if (!(await this.repo.isKoskNazim(user.sub, koskId))) {
      throw new AuthzForbiddenError(
        "Only a nazım of the köşk and the başnazım hand out course permissions"
      );
    }
    const held: string[] = [
      ...ROLE_DEFAULT_PERMISSIONS[ASSIGNED_ROLES.KOSK_NAZIM],
      ...(await this.repo.heldCodesInKosk(user.sub, koskId)),
    ];
    return grantableCourseCodes(held);
  }

  private async resolvePeople(
    ids: string[]
  ): Promise<Map<string, IGrantPersonRow>> {
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
    people: Map<string, IGrantPersonRow>
  ): KoskPersonResponse {
    const row = people.get(id);
    return { id, name: nameOf(row), email: row?.email ?? null };
  }

  async list(
    user: AuthenticatedUser,
    koskId: string
  ): Promise<KoskGrantsResponse> {
    const grantable = await this.grantable(user, koskId);
    const courseRows = await this.repo.courseRows(koskId);
    const courseById = new Map(courseRows.map((c) => [c.id, c]));
    const freeIds = courseRows.filter((c) => c.madrasahName === null);
    const posts = await this.repo.heldPosts(freeIds.map((c) => c.id));
    const [codes, people] = await Promise.all([
      this.repo.heldCodes(
        [...new Set(posts.map((p) => p.userId))],
        freeIds.map((c) => c.id)
      ),
      this.resolvePeople(posts.flatMap((p) => [p.userId, p.grantedBy])),
    ]);
    const items: KoskGrantResponse[] = posts.flatMap((p) => {
      const course = courseById.get(p.courseId);
      if (!course) return [];
      return [
        {
          id: p.id,
          user: this.person(p.userId, people),
          course: {
            id: course.id,
            title: course.title,
            madrasahName: course.madrasahName,
          },
          permissions: codes.get(`${p.userId}:${p.courseId}`) ?? [],
          endsAt: p.endsAt,
          grantedBy: this.person(p.grantedBy, people),
          grantedAt: p.grantedAt,
        },
      ];
    });
    return {
      items,
      courses: courseRows.map((c) => ({
        id: c.id,
        title: c.title,
        madrasahName: c.madrasahName,
      })),
      grantable: [...grantable],
    };
  }

  /** Codes in the catalog and held by the giver; the 400 or 403 otherwise. */
  private async checked(
    user: AuthenticatedUser,
    koskId: string,
    requested: string[]
  ): Promise<string[]> {
    const grantable = await this.grantable(user, koskId);
    const { codes, unknown, beyondGiver } = checkRequestedCodes(
      requested,
      grantable
    );
    if (unknown.length > 0) throw new UnknownPermissionError(unknown);
    if (beyondGiver.length > 0) throw new GrantExceedsGiverError(beyondGiver);
    return codes;
  }

  private endOf(value: string | null | undefined): Date | null {
    const endsAt = value ? new Date(value) : null;
    if (checkGrantExpiry(endsAt, null, new Date()) === "past") {
      throw new GrantExpiryInvalidError("The end date is in the past");
    }
    return endsAt;
  }

  async create(
    user: AuthenticatedUser,
    koskId: string,
    dto: CreateKoskGrantDto
  ): Promise<KoskGrantsResponse> {
    const permissions = await this.checked(user, koskId, dto.permissions);
    const endsAt = this.endOf(dto.endsAt);
    const userId = dto.userId.toLowerCase();
    await this.assertKnownAccount(userId);
    await this.repo.assign(user.sub, koskId, {
      userId,
      courseId: dto.courseId.toLowerCase(),
      permissions,
      endsAt,
      authority: this.authorityOf(user),
    });
    return this.list(user, koskId);
  }

  async update(
    user: AuthenticatedUser,
    koskId: string,
    grantId: string,
    dto: UpdateKoskGrantDto
  ): Promise<KoskGrantsResponse> {
    const permissions = await this.checked(user, koskId, dto.permissions);
    const endsAt = this.endOf(dto.endsAt);
    await this.repo.update(user.sub, koskId, grantId, {
      permissions,
      endsAt,
      authority: this.authorityOf(user),
    });
    return this.list(user, koskId);
  }

  /** Who holds the ders nazırı post, or null when the köşk has no such post. */
  holderOf(koskId: string, grantId: string): Promise<string | null> {
    return this.repo.postHolder(koskId, grantId);
  }

  async revoke(
    user: AuthenticatedUser,
    koskId: string,
    grantId: string
  ): Promise<void> {
    await this.grantable(user, koskId);
    await this.repo.revoke(user.sub, koskId, grantId);
  }

  /** The account must exist: in the users table or in the realm. */
  private async assertKnownAccount(userId: string): Promise<void> {
    if ((await this.repo.people([userId])).has(userId)) return;
    const inRealm = this.keycloak.isConfigured()
      ? await this.keycloak.findById(userId)
      : null;
    if (!inRealm) throw new KoskNazimUnknownAccountError(userId);
  }
}
