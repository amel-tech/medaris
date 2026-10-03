import { AuthzService, ROLES } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { KeycloakAdminService } from "../keycloak-admin/keycloak-admin.service";
import { UserSummaryResponse } from "../user/dto/user-summary-response.dto";
import { UserLookupForbiddenError } from "../user/errors/user-lookup-forbidden.error";
import { TokenClaims } from "../user/interfaces/token-claims.interface";
import { identityFromClaims } from "../user/user-identity";
import { AssignmentRepository } from "./assignment.repository";
import { displayNameOf } from "./assignment.service";

const CHIEF_CACHE_MS = 5 * 60_000;

/**
 * The realm's user directory as the assignment screens see it (MDRS-169):
 * who may be found by e-mail, and who the Medaris başnazımı is.
 */
@Injectable()
export class UserDirectoryService {
  private chief: { name: string | null; at: number } | null = null;

  constructor(
    private readonly keycloak: KeycloakAdminService,
    private readonly repo: AssignmentRepository,
    private readonly authz: AuthzService
  ) {}

  /**
   * Exact e-mail search over the realm, so a person who has never opened the
   * app can still be given a role. Callable by SYSTEM_ADMIN and anyone who
   * holds a role (the account screen lists "E-postayla kullanıcı bul" under
   * both köşk nazımı and müderris). Every search is written to `audit_log`.
   */
  async lookup(
    claims: TokenClaims,
    email: string
  ): Promise<UserSummaryResponse[]> {
    const identity = identityFromClaims(claims);
    const allowed =
      this.authz.isSystemAdmin(claims) ||
      (identity !== null && (await this.repo.holdsAnyRole(identity.id)));
    if (!allowed || !identity) throw new UserLookupForbiddenError();

    const found = await this.keycloak.findByExactEmail(email);
    await this.repo.recordUserLookup({
      actorId: identity.id,
      foundId: found?.id ?? null,
      email,
    });
    return found ? [found] : [];
  }

  /**
   * The başnazım is whoever holds the SYSTEM_ADMIN realm role. Not finding
   * anyone, or not reaching the directory, is an answer (`null`), not an
   * error: the "no access" screen has a sentence for it. Cached a few
   * minutes so a page of 403s does not become a page of directory calls.
   */
  async chiefNazimName(): Promise<string | null> {
    if (this.chief && Date.now() - this.chief.at < CHIEF_CACHE_MS) {
      return this.chief.name;
    }
    let name: string | null = null;
    try {
      if (this.keycloak.isConfigured()) {
        const holders = await this.keycloak.findByRealmRole(ROLES.SYSTEM_ADMIN);
        name = displayNameOf(holders[0]) ?? null;
      }
    } catch {
      name = null;
    }
    this.chief = { name, at: Date.now() };
    return name;
  }
}
