import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import * as client from "openid-client";
import type { AuthErrorCode } from "../shared/auth-error";
import { httpStatusOf } from "../shared/unauthenticated";
import type { ResolvedAuthConfig } from "./config";

/**
 * The IdP, through OIDC discovery only (`/.well-known/openid-configuration`):
 * no Keycloak path is written down anywhere in the web code (C4), so the day
 * the issuer is QAuth instead, the change is the issuer URL.
 *
 * The discovered configuration is kept for the life of the process. A failed
 * discovery is not kept: the next request tries again, so an IdP that was
 * down at boot does not stay "down" for this process.
 */
export interface Oidc {
  configuration(): Promise<client.Configuration>;
  /**
   * The IdP's signing keys, from the discovered `jwks_uri`: what a
   * back-channel logout token is verified against (auth Phase 2). jose
   * caches them and fetches again for a `kid` it does not know.
   */
  jwks(): Promise<JWTVerifyGetKey>;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function createOidc(config: ResolvedAuthConfig): Oidc {
  let pending: Promise<client.Configuration> | undefined;
  let keys: JWTVerifyGetKey | undefined;
  // openid-client refuses plain http. A Keycloak container on this machine
  // (the Playwright realm) is the one place that is fine.
  const insecure =
    config.issuer.protocol === "http:" && LOOPBACK.has(config.issuer.hostname);

  const configuration = () => {
    pending ??= client
      .discovery(
        config.issuer,
        config.clientId,
        config.clientSecret,
        undefined,
        {
          timeout: config.httpTimeout,
          execute: insecure ? [client.allowInsecureRequests] : [],
        }
      )
      .catch((error: unknown) => {
        pending = undefined;
        throw error;
      });
    return pending;
  };

  return {
    configuration,
    async jwks() {
      if (keys) return keys;
      const { jwks_uri } = (await configuration()).serverMetadata();
      if (!jwks_uri) {
        throw new Error("@medaris/auth: the IdP's discovery names no jwks_uri");
      }
      keys = createRemoteJWKSet(new URL(jwks_uri), {
        timeoutDuration: config.httpTimeout * 1000,
      });
      return keys;
    },
  };
}

/** The OAuth `error` code an openid-client error carries, if any. */
export const oauthErrorOf = (error: unknown): string | undefined => {
  const code = (error as { error?: unknown } | null)?.error;
  return typeof code === "string" ? code : undefined;
};

/**
 * Whether a failed token request (a refresh) is final.
 *
 * Final: the IdP answered with an OAuth error (`invalid_grant`: the SSO
 * session is gone, or the refresh token expired or was reused;
 * `invalid_client`: the secret no longer matches), or with a 4xx. Not final: no
 * answer at all (a timeout, a network error), a 5xx, or
 * `temporarily_unavailable` / `server_error`, which another try may get past.
 */
export function isFinalGrantFailure(error: unknown): boolean {
  const code = oauthErrorOf(error);
  if (code === "temporarily_unavailable" || code === "server_error") {
    return false;
  }
  const status = httpStatusOf(error);
  if (status !== undefined && status >= 500) return false;
  if (code) return true;
  return (
    status !== undefined && status >= 400 && status !== 408 && status !== 429
  );
}

/** The `?error=` code a failed callback reports. */
export function callbackErrorCode(error: unknown): AuthErrorCode {
  const code = oauthErrorOf(error);
  if (code === "access_denied") return "AccessDenied";
  if (code === "invalid_client" || code === "unauthorized_client") {
    return "Configuration";
  }
  return "OAuthCallback";
}

/**
 * What a failure is logged as: names and codes only (MDRS-231). An
 * openid-client error can carry the response, and the request behind a token
 * call carries the refresh token and the client secret.
 */
export function failureSummary(error: unknown): Record<string, unknown> {
  if (typeof error !== "object" || error === null) {
    return { thrown: typeof error };
  }
  const source = error as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  for (const field of ["name", "code", "error", "error_description"]) {
    if (typeof source[field] === "string") summary[field] = source[field];
  }
  const status = httpStatusOf(error);
  if (status !== undefined) summary.status = status;
  return summary;
}
