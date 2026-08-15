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
   * this API. Empty means the claim is not restricted; `aud` still binds the
   * token to this API.
   */
  allowedClients: string[];
}

/**
 * Keycloak stamps `typ` on the payload: `Bearer` for access tokens, `ID` for
 * ID tokens, `Refresh` for refresh tokens. Only an access token may be
 * presented to an API.
 */
const REQUIRED_TOKEN_TYPE = "Bearer";

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

  return {
    issuer,
    // Non-empty by the guard above.
    audience: audience as [string, ...string[]],
    allowedClients: toList(config.get("keycloak.allowedClients")),
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
