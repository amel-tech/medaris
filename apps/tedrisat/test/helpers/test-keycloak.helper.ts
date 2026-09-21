import { createSign } from "node:crypto";
import type { IPublicKeyProvider } from "@medaris/common";
import { inject } from "vitest";

/**
 * tedrisat — the in-process stand-in for the realm (MDRS-89).
 *
 * `apps/tedrisat/test/unit/jwt-claim-validation.spec.ts` (MDRS-30) already
 * proved this shape works: generate a keypair, hand the verifier a one-method
 * `IPublicKeyProvider`, sign tokens with the private half, and mount the REAL
 * `AuthGuard` and `JwtVerifierService` on top. This file lifts that from one
 * unit spec to every e2e app, so nothing in the suite reaches for the network.
 *
 * `import type` for `IPublicKeyProvider`: it is an interface, so a value import
 * has nothing to resolve at runtime. Unrelated to the `useImportType` trap in
 * CLAUDE.md, which is about NestJS constructor parameters needing to survive
 * into `design:paramtypes` — nothing here is injected by Nest.
 */

/** Seconds, not milliseconds — `exp` and `iat` are NumericDate. */
function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * The key provider `createTestApp` installs in place of
 * `KeycloakPublicKeyProvider`.
 *
 * It refuses an unknown `kid` exactly as the real one does, so the guard's
 * "key not found" path stays reachable from a test rather than being stubbed
 * into always-succeeding.
 */
export function stubPublicKeyProvider(): IPublicKeyProvider {
  const { kid, publicKey } = inject("keycloak");

  return {
    async getKey(requestedKid: string): Promise<string> {
      if (requestedKid !== kid) {
        throw new Error(`Key not found: ${requestedKid}`);
      }
      return publicKey;
    },
  };
}

export interface MintTokenOptions {
  /** `sub`. Every ownership decision downstream reads it. */
  sub: string;
  /** Overrides for the payload, for suites that need a token to be rejected. */
  claims?: Record<string, unknown>;
  /** Overrides for the JOSE header, e.g. a wrong `kid` or `alg`. */
  header?: Record<string, unknown>;
  /** Seconds from now until `exp`. */
  expiresInSeconds?: number;
}

/**
 * Mints an RS256 access token this run's stubbed realm will accept.
 *
 * The defaults are the claims `JwtVerifierService` requires and nothing more:
 * `iss` and `aud` from the provided context, a numeric `exp`, a non-empty `sub`
 * and `typ: "Bearer"` — the last of which is the one Keycloak puts on the
 * payload rather than the header, and the one MDRS-30 added the check for.
 *
 * `azp` is deliberately absent. The verifier only enforces an allow-list when
 * `KEYCLOAK_ALLOWED_CLIENTS` is set, and `test-app.helper.ts` leaves it unset
 * with a single-client audience, so requiring an `azp` here would encode a
 * binding the configuration does not have.
 */
export function mintTestToken(options: MintTokenOptions): string {
  const { kid, privateKey, issuer, audience } = inject("keycloak");
  const issuedAt = nowInSeconds();

  const header = {
    alg: "RS256",
    typ: "JWT",
    kid,
    ...options.header,
  };

  const payload = {
    iss: issuer,
    aud: audience,
    sub: options.sub,
    typ: "Bearer",
    iat: issuedAt,
    exp: issuedAt + (options.expiresInSeconds ?? 300),
    preferred_username: "test",
    ...options.claims,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload)
  )}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .end()
    .sign(privateKey);

  return `${signingInput}.${base64url(signature)}`;
}

/** `Authorization` header value for a freshly minted token. */
export function bearerFor(options: MintTokenOptions): string {
  return `Bearer ${mintTestToken(options)}`;
}
