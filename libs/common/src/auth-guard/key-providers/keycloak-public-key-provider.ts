import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  type CompactJWSHeaderParameters,
  type CryptoKey,
  createRemoteJWKSet,
  type FlattenedJWSInput,
} from "jose";
import { IPublicKeyProvider } from "../interfaces/public-key-provider.interface";

/** Seconds from an environment variable; the default when unset or not a positive number. */
function seconds(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * The IdP's signing keys, read from its JSON Web Key Set (auth audit C5).
 *
 * Nothing here is Keycloak-specific any more except the variable names: every
 * OpenID provider publishes a `jwks_uri`, and `KEYCLOAK_JWKS_URL` is set to
 * it. jose's `createRemoteJWKSet` picks the key by the token's `kid` and
 * `alg`, so RSA, EC and Ed25519 keys all work, with or without an `x5c`
 * certificate. Before C5 every key went through `x5c[0]`, so one JWKS entry
 * without a certificate made every lookup throw.
 *
 * The two cache variables keep their meaning, mapped onto jose's options:
 *
 * - `KEYCLOAK_CACHE_TTL` (default 86400 s): how long a fetched key set is
 *   trusted before the next verification fetches it again, so a key the realm
 *   removed stops verifying after at most this long. jose's `cacheMaxAge`.
 * - `KEYCLOAK_NOT_FOUND_CACHE_TTL` (default 120 s): how long an unknown `kid`
 *   is refused without fetching again. jose's `cooldownDuration`. It now
 *   counts from the last fetch instead of per `kid`, so a caller inventing
 *   `kid`s (see the note in `throttler.module.ts`) causes at most one fetch
 *   per window instead of one per `kid`.
 *
 * jose fetches with the global `fetch`, looked up on every call, so the
 * MDRS-89 guard in the tedrisat suite still sees each request.
 */
@Injectable()
export class KeycloakPublicKeyProvider
  implements IPublicKeyProvider, OnModuleInit
{
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  // A value import of `ConfigService`, and no bare `@Inject()`: Nest reads the
  // type from `design:paramtypes`. A bare `@Inject()` resolved to `Function`
  // under the SWC transform the specs run through, because SWC also stamps
  // `design:type` on the class.
  constructor(configService: ConfigService) {
    const jwksUrl = configService.get<string>("keycloak.jwksUrl");
    if (!jwksUrl) {
      throw new Error(`KEYCLOAK_JWKS_URL environment variable is required`);
    }

    this.jwks = createRemoteJWKSet(new URL(jwksUrl), {
      cacheMaxAge: seconds(process.env.KEYCLOAK_CACHE_TTL, 86400) * 1000,
      cooldownDuration:
        seconds(process.env.KEYCLOAK_NOT_FOUND_CACHE_TTL, 120) * 1000,
    });
  }

  getKey(
    protectedHeader: CompactJWSHeaderParameters,
    token: FlattenedJWSInput
  ): Promise<CryptoKey> {
    return this.jwks(protectedHeader, token);
  }

  async onModuleInit() {
    try {
      await this.jwks.reload();
    } catch (error) {
      // Log error but don't fail module initialization: the first
      // verification fetches the set again.
      console.error(
        "Failed to pre-load JWKS keys during module initialization:",
        error
      );
    }
  }
}
