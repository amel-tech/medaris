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
import { PARTNER_ENROLLMENT_ROLE } from "./domain/partner-enrollment";
import type { IRegisteredPartner } from "./domain/partner-registry";
import {
  PartnerDisabledError,
  PartnerRoleMissingError,
} from "./errors/partner-errors";
import { PartnerRegistry } from "./partner-registry";
import type { PartnerRequest } from "./partner-request";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The claims a partner's token is held to: tedrisat's own issuer and audience,
 * and the registered partner applications as the only clients. The front-ends
 * are not on it, so a person's token is refused here; and `refusedClients` is
 * emptied, because the other routes' verifier refuses the partners themselves.
 */
export function partnerClaimPolicy(
  base: JwtClaimPolicy,
  partners: readonly { clientId: string }[]
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
 * an access token — under `partnerClaimPolicy`, so its `azp` is a registered
 * partner's (`integration_partners`, which the başnazım keeps in nizam), when
 * that partner is enabled, and when the token carries the `partner-enrollment`
 * realm role. Nothing else passes, and nothing it lets through reaches another
 * route: `AuthGuard`'s verifier refuses every registered partner's client
 * (`REFUSED_CLIENT_SOURCE`), enabled or not.
 *
 * A disabled partner's token is verified like an enabled one's and then
 * refused with 403 `PARTNER_DISABLED`: it is the partner's, and the partner is
 * told why, as with a missing role.
 *
 * `AuthGuard` is not on these routes: its policy allows the front-ends'
 * clients, not the partners'. No global guard reads the token, so nothing
 * refuses a partner's before this one runs (the global `ThrottlerGuard` counts
 * by address only).
 *
 * With no partner registered every request answers 404, as a route that does
 * not exist, before the token is read. The registry is read through
 * `PartnerRegistry`, which keeps it for a minute and forgets it on every write
 * in this process.
 *
 * It sets `request.partner`, never `request.user`: see `PartnerRequest`.
 */
@Injectable()
export class PartnerGuard implements CanActivate {
  private readonly base: JwtClaimPolicy;
  // The verifier of the registry as last read; a new read is a new map.
  private verifierOf: {
    partners: ReadonlyMap<string, IRegisteredPartner>;
    verifier: JwtTokenVerifier;
  } | null = null;

  // `keyProvider` is the realm's JWKS that `AuthGuard` verifies with, so a
  // partner's token costs no key fetch of its own. Value imports: see the
  // useImportType trap in AGENTS.md.
  constructor(
    @Inject(PUBLIC_KEY_PROVIDER)
    private readonly keyProvider: IPublicKeyProvider,
    config: ConfigService,
    private readonly registry: PartnerRegistry
  ) {
    this.base = loadJwtClaimPolicy(config);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PartnerRequest>();
    const partners = await this.registry.all();
    if (partners.size === 0) {
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
      payload = await this.verifier(partners).verifyToken(token);
    } catch {
      // Bare, as `AuthGuard` answers: the reason stays on the server.
      throw new UnauthorizedException();
    }

    const claims = mapAccessTokenClaims(payload);
    const partner =
      claims.clientId === undefined ? undefined : partners.get(claims.clientId);
    if (!partner) {
      // The policy admits the registered partners alone; this is a second lock.
      throw new UnauthorizedException();
    }
    if (!partner.enabled) {
      throw new PartnerDisabledError({ clientId: partner.clientId });
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

  private verifier(
    partners: ReadonlyMap<string, IRegisteredPartner>
  ): JwtTokenVerifier {
    if (this.verifierOf?.partners !== partners) {
      this.verifierOf = {
        partners,
        verifier: new JwtTokenVerifier(
          this.keyProvider,
          partnerClaimPolicy(this.base, [...partners.values()])
        ),
      };
    }
    return this.verifierOf.verifier;
  }
}
