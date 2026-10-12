import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  decodeProtectedHeader,
  errors,
  type JWSAlgorithm,
  type JWTPayload,
  jwtVerify,
} from "jose";
import { mapAccessTokenClaims } from "../access-token-claims";
import { PUBLIC_KEY_PROVIDER } from "../auth-guard.tokens";
import {
  JwtClaimError,
  JwtDecodeError,
  JwtMissingKidError,
  JwtVerificationError,
  KeyNotFoundError,
} from "../exceptions/exceptions";
import { IJwtVerifier } from "../interfaces/jwt-verifier.interface";
import { IPublicKeyProvider } from "../interfaces/public-key-provider.interface";

/**
 * The claim checks applied on top of the signature.
 *
 * A signature alone only proves the token was minted by the realm whose JWKS
 * the key provider resolves `kid` against. Within that realm every token
 * signed by the realm key would otherwise pass: an ID token, a token minted
 * for a different client, or a service-account token for an unrelated
 * application.
 */
export interface JwtClaimPolicy {
  /** Expected `iss`. */
  issuer: string;
  /**
   * Accepted `aud` values — the token must carry at least one of them. Typed
   * as a non-empty tuple because an empty list is a configuration error:
   * `jsonwebtoken` skipped the audience check on one, jose would refuse every
   * token, and `loadJwtClaimPolicy` refuses to start instead.
   */
  audience: [string, ...string[]];
  /**
   * Accepted `azp` values, i.e. the clients allowed to request a token for
   * this API. Empty means the claim is not restricted, which is safe only when
   * `aud` names this API specifically — with a realm-wide audience it is not,
   * and `loadJwtClaimPolicy` refuses that combination.
   */
  allowedClients: string[];
}

/**
 * The signature algorithms a token may use (auth audit C5). An explicit list,
 * so the token's own `alg` header can never choose an HMAC (`HS256` keyed
 * with the published public key) or `none`; jose refuses anything else before
 * it looks for a key.
 *
 * `RS256` is what Keycloak signs with today. `ES256` and `EdDSA` are there so
 * the IdP can move to an EC or Ed25519 key, or be replaced by one that signs
 * that way (QAuth), without a code change; `Ed25519` is the RFC 9864 name for
 * the same Ed25519 signatures. A key still has to be in the IdP's JWKS, and
 * jose only takes a key of the type the `alg` names.
 */
const ACCEPTED_ALGORITHMS: JWSAlgorithm[] = [
  "RS256",
  "ES256",
  "EdDSA",
  "Ed25519",
];

/**
 * Seconds of clock skew allowed on `exp` and `nbf`. Zero, as it was under
 * `jsonwebtoken`, whose default it was.
 */
const CLOCK_TOLERANCE_SECONDS = 0;

/**
 * Audiences Keycloak puts in *every* access token of a realm.
 *
 * `account` comes from the built-in `account` client scope, which is assigned
 * to every client by default. Configuring it as the expected audience is
 * therefore not a cross-client check at all — it accepts precisely the tokens
 * the audience option exists to reject, including a service-account token for
 * an unrelated application. It is still a legitimate interim value while an
 * audience mapper for the API's own client id is missing, but only together
 * with an `azp` allow-list, which is what carries the client binding in that
 * configuration. `loadJwtClaimPolicy` enforces the pairing.
 */
const REALM_WIDE_AUDIENCES = ["account"];

function toList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

/**
 * Reads the policy from configuration, refusing to start when a
 * security-relevant value is missing.
 *
 * Falling back to "no issuer check" or "no audience check" would leave the
 * verifier accepting exactly the tokens this class exists to reject, and the
 * gap would be invisible at runtime — so it is a boot failure instead.
 */
export function loadJwtClaimPolicy(config: ConfigService): JwtClaimPolicy {
  const issuer = config.get<string>("keycloak.issuer");
  const audience = toList(config.get("keycloak.audience"));

  if (!issuer || audience.length === 0) {
    const missing = [
      issuer ? "" : "keycloak.issuer (KEYCLOAK_ISSUER)",
      audience.length > 0 ? "" : "keycloak.audience (KEYCLOAK_AUDIENCE)",
    ].filter(Boolean);

    throw new Error(
      "JwtVerifierService cannot verify tokens without a claim policy: " +
        `${missing.join(", ")} is not configured. Verifying the signature ` +
        "alone would accept any token signed by the realm key."
    );
  }

  const allowedClients = toList(config.get("keycloak.allowedClients"));
  const realmWide = audience.filter((entry) =>
    REALM_WIDE_AUDIENCES.includes(entry)
  );

  if (realmWide.length > 0 && allowedClients.length === 0) {
    throw new Error(
      `JwtVerifierService was configured with the realm-wide audience "${realmWide.join(
        '", "'
      )}", which Keycloak mints into every token of the realm, and no ` +
        "keycloak.allowedClients (KEYCLOAK_ALLOWED_CLIENTS) to bind the token " +
        "to a client. That pair verifies less than it appears to — set the " +
        "allow-list, or configure an audience mapper for this API's own " +
        "client id and use that instead."
    );
  }

  return {
    issuer,
    // Non-empty by the guard above.
    audience: audience as [string, ...string[]],
    allowedClients,
  };
}

/**
 * A jose failure as one of this module's errors: an unknown key stays
 * `KeyNotFoundError`, as the key provider reported it before C5, and every
 * other failure (signature, algorithm, `iss`, `aud`, `exp`, `nbf`, the JWKS
 * fetch) is a `JwtVerificationError` carrying jose's code, e.g.
 * `unexpected "aud" claim value (ERR_JWT_CLAIM_VALIDATION_FAILED)`.
 */
function verificationFailure(error: unknown): Error {
  if (error instanceof KeyNotFoundError) {
    return error;
  }
  if (error instanceof errors.JWKSNoMatchingKey) {
    return new KeyNotFoundError(
      "No key in the JWKS matches the token's kid and alg"
    );
  }
  if (error instanceof errors.JOSEError) {
    return new JwtVerificationError(`${error.message} (${error.code})`);
  }
  return new JwtVerificationError(
    error instanceof Error ? error.message : String(error)
  );
}

@Injectable()
export class JwtVerifierService implements IJwtVerifier {
  private readonly policy: JwtClaimPolicy;

  constructor(
    @Inject(PUBLIC_KEY_PROVIDER) private keyProvider: IPublicKeyProvider,
    // No bare `@Inject()` here: see KeycloakPublicKeyProvider's constructor.
    configService: ConfigService
  ) {
    this.policy = loadJwtClaimPolicy(configService);
  }

  async verifyToken(token: string): Promise<JWTPayload> {
    let kid: unknown;
    try {
      kid = decodeProtectedHeader(token).kid;
    } catch {
      throw new JwtDecodeError();
    }
    if (!kid) throw new JwtMissingKidError();

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(
        token,
        (protectedHeader, flattened) =>
          this.keyProvider.getKey(protectedHeader, flattened),
        {
          algorithms: ACCEPTED_ALGORITHMS,
          issuer: this.policy.issuer,
          audience: this.policy.audience,
          clockTolerance: CLOCK_TOLERANCE_SECONDS,
        }
      ));
    } catch (error) {
      throw verificationFailure(error);
    }

    return this.assertClaims(payload);
  }

  /**
   * Checks the claims jose does not check on its own. `iss`, `aud`, `exp` and
   * `nbf` are already enforced by the options above.
   */
  private assertClaims(decoded: JWTPayload): JWTPayload {
    // jose, like `jsonwebtoken` before it, enforces `exp` when it is present
    // but accepts a token that omits it, which would never expire. Keycloak
    // always sets it.
    if (typeof decoded.exp !== "number") {
      throw new JwtClaimError("JWT carries no exp claim, so it never expires");
    }

    // Every ownership decision downstream reads `request.user.sub`. A token
    // without one yields `userId === undefined` in the services rather than a
    // denial, so it is rejected here instead.
    if (typeof decoded.sub !== "string" || decoded.sub.length === 0) {
      throw new JwtClaimError("JWT carries no sub claim, so it names no user");
    }

    // The token type and the client are IdP-specific claims, read through the
    // one mapping (Keycloak's `typ` and `azp` today).
    const claims = mapAccessTokenClaims(decoded);

    if (!claims.isAccessToken) {
      throw new JwtClaimError(
        `JWT is not an access token: typ is ${
          claims.tokenType === undefined
            ? "absent"
            : `"${String(claims.tokenType)}"`
        }`
      );
    }

    if (this.policy.allowedClients.length > 0) {
      if (
        claims.clientId === undefined ||
        !this.policy.allowedClients.includes(claims.clientId)
      ) {
        throw new JwtClaimError(
          `JWT was issued to a client that may not call this API: azp is ${
            claims.clientId === undefined ? "absent" : `"${claims.clientId}"`
          }`
        );
      }
    }

    return decoded;
  }
}
