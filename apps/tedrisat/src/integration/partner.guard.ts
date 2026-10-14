import {
  IPublicKeyProvider,
  type JwtClaimPolicy,
  JwtTokenVerifier,
  loadJwtClaimPolicy,
  mapAccessTokenClaims,
  PUBLIC_KEY_PROVIDER,
} from "@medaris/common";
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { IIntegrationPartner } from "../config/integration-partners-env";
import { PARTNER_ENROLLMENT_ROLE } from "./domain/partner-enrollment";
import { PartnerRoleMissingError } from "./errors/partner-errors";
import type { PartnerRequest } from "./partner-request";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The claims a partner's token is held to: tedrisat's own issuer and audience,
 * and the partner applications as the only clients. The front-ends are not on
 * it, so a person's token is refused here; and `refusedClients` is emptied,
 * because it holds the partners themselves for the other routes' verifier.
 */
export function partnerClaimPolicy(
  base: JwtClaimPolicy,
  partners: readonly IIntegrationPartner[]
): JwtClaimPolicy {
  return {
    ...base,
    allowedClients: partners.map((partner) => partner.clientId),
    refusedClients: [],
  };
}

/**
 * The only guard of `/integrations/*` (partner enrollments). A token passes
 * when tedrisat's verifier accepts it — signature, issuer, audience, expiry,
 * an access token — under `partnerClaimPolicy`, so its `azp` is one of
 * `INTEGRATION_PARTNERS`, and when it carries the `partner-enrollment` realm
 * role. Nothing else passes, and nothing it lets through reaches another
 * route: `AuthGuard`'s verifier refuses a partner client outright
 * (`keycloak.refusedClients`).
 *
 * `AuthGuard` is not on these routes: its policy allows the front-ends'
 * clients, not the partners'. No global guard reads the token, so nothing
 * refuses a partner's before this one runs (the global `ThrottlerGuard` counts
 * by address only).
 *
 * With no partner configured every request answers 404, as a route that does
 * not exist, before the token is read.
 *
 * It sets `request.partner`, never `request.user`: see `PartnerRequest`.
 */
@Injectable()
export class PartnerGuard implements CanActivate {
  private readonly partners: ReadonlyMap<string, IIntegrationPartner>;
  private readonly verifier: JwtTokenVerifier | null;

  // `keyProvider` is the realm's JWKS that `AuthGuard` verifies with, so a
  // partner's token costs no key fetch of its own. Value imports: see the
  // useImportType trap in AGENTS.md.
  constructor(
    @Inject(PUBLIC_KEY_PROVIDER) keyProvider: IPublicKeyProvider,
    config: ConfigService
  ) {
    const partners =
      config.get<IIntegrationPartner[]>("integrations.partners") ?? [];
    this.partners = new Map(
      partners.map((partner) => [partner.clientId, partner])
    );
    this.verifier =
      partners.length === 0
        ? null
        : new JwtTokenVerifier(
            keyProvider,
            partnerClaimPolicy(loadJwtClaimPolicy(config), partners)
          );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PartnerRequest>();
    if (!this.verifier) {
      // Worded as Nest words a route it does not have.
      throw new NotFoundException(
        `Cannot ${request.method} ${request.originalUrl ?? request.url}`
      );
    }

    const header = request.headers.authorization;
    const [scheme, token] = String(header ?? "").split(" ");
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException();
    }

    let payload: { sub?: unknown };
    try {
      payload = await this.verifier.verifyToken(token);
    } catch {
      // Bare, as `AuthGuard` answers: the reason stays on the server.
      throw new UnauthorizedException();
    }

    const claims = mapAccessTokenClaims(payload);
    const partner =
      claims.clientId === undefined
        ? undefined
        : this.partners.get(claims.clientId);
    if (!partner) {
      // The policy admits the partners alone; this is a second lock.
      throw new UnauthorizedException();
    }
    if (!claims.roles.includes(PARTNER_ENROLLMENT_ROLE)) {
      throw new PartnerRoleMissingError({ clientId: partner.clientId });
    }
    // The audit log records the actor as a uuid; Keycloak's are.
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (!UUID.test(sub)) {
      throw new UnauthorizedException();
    }

    request.partner = {
      clientId: partner.clientId,
      name: partner.name,
      actorId: sub.toLowerCase(),
    };
    return true;
  }
}
