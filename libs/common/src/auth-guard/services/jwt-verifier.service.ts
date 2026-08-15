import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as jwt from "jsonwebtoken";
import { PUBLIC_KEY_PROVIDER } from "../auth-guard.tokens";
import {
  JwtClaimError,
  JwtDecodeError,
  JwtMissingKidError,
  JwtVerificationError,
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
   * as a non-empty tuple because an empty list would make `jsonwebtoken` skip
   * the audience check entirely.
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
 * Keycloak stamps `typ` on the payload: `Bearer` for access tokens, `ID` for
 * ID tokens, `Refresh` for refresh tokens. Only an access token may be
 * presented to an API.
 */
const REQUIRED_TOKEN_TYPE = "Bearer";

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

@Injectable()
export class JwtVerifierService implements IJwtVerifier {
  private readonly policy: JwtClaimPolicy;

  constructor(
    @Inject(PUBLIC_KEY_PROVIDER) private keyProvider: IPublicKeyProvider,
    @Inject() configService: ConfigService
  ) {
    this.policy = loadJwtClaimPolicy(configService);
  }

  async verifyToken(token: string): Promise<any> {
    const decodedCompleteJwt = jwt.decode(token, { complete: true });
    if (!decodedCompleteJwt || typeof decodedCompleteJwt === "string")
      throw new JwtDecodeError();

    const kid = decodedCompleteJwt.header.kid;
    if (!kid) throw new JwtMissingKidError();

    const key = await this.keyProvider.getKey(kid);

    const decoded = await new Promise<jwt.JwtPayload | string | undefined>(
      (resolve, reject) => {
        jwt.verify(
          token,
          key,
          {
            algorithms: ["RS256"],
            issuer: this.policy.issuer,
            audience: this.policy.audience,
          },
          (err, verified) => {
            if (err) return reject(new JwtVerificationError(err.message));
            resolve(verified);
          }
        );
      }
    );

    return this.assertClaims(decoded);
  }

  /**
   * Checks the claims `jsonwebtoken` does not know about. `iss`, `aud` and the
   * expiry are already enforced by the verify options above.
   */
  private assertClaims(decoded: jwt.JwtPayload | string | undefined) {
    if (!decoded || typeof decoded !== "object") {
      throw new JwtDecodeError("JWT payload is not a JSON object");
    }

    // `jsonwebtoken` enforces `exp` when it is present but accepts a token
    // that omits it, which would never expire. Keycloak always sets it.
    if (typeof decoded.exp !== "number") {
      throw new JwtClaimError("JWT carries no exp claim, so it never expires");
    }

    // Every ownership decision downstream reads `request.user.sub`. A token
    // without one yields `userId === undefined` in the services rather than a
    // denial, so it is rejected here instead.
    if (typeof decoded.sub !== "string" || decoded.sub.length === 0) {
      throw new JwtClaimError("JWT carries no sub claim, so it names no user");
    }

    const tokenType = decoded.typ;
    if (tokenType !== REQUIRED_TOKEN_TYPE) {
      throw new JwtClaimError(
        `JWT is not an access token: typ is ${
          tokenType === undefined ? "absent" : `"${String(tokenType)}"`
        }, expected "${REQUIRED_TOKEN_TYPE}"`
      );
    }

    if (this.policy.allowedClients.length > 0) {
      const authorizedParty = decoded.azp;
      if (
        typeof authorizedParty !== "string" ||
        !this.policy.allowedClients.includes(authorizedParty)
      ) {
        throw new JwtClaimError(
          `JWT was issued to a client that may not call this API: azp is ${
            authorizedParty === undefined
              ? "absent"
              : `"${String(authorizedParty)}"`
          }`
        );
      }
    }

    return decoded;
  }
}
