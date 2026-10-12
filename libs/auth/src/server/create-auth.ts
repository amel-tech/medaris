import { type AuthConfig, resolveConfig } from "./config";
import { createOidc } from "./oidc";
import { type AuthProxy, createAuthProxy } from "./proxy";
import { createServerReads, type ServerReads } from "./reads";
import { createSessionRenewal } from "./renewal";
import { type AuthRouteHandlers, createRouteHandlers } from "./routes";
import { createSessionCookie } from "./session-cookie";

export interface Auth extends ServerReads {
  /** The route handlers; see `AuthRouteHandlers`. */
  handlers: AuthRouteHandlers;
  /** The auth step of the app's `proxy.ts`; see `AuthProxyOptions`. */
  proxy: AuthProxy;
}

/**
 * One app's auth, built once from its own environment (`lib/auth.ts`):
 *
 * ```ts
 * export const { auth, getAccessToken, requireSession, withAccessToken,
 *   handlers, proxy } = createAuth({
 *   issuer: env.KEYCLOAK_ISSUER,
 *   clientId: env.KEYCLOAK_CLIENT_ID,
 *   clientSecret: env.KEYCLOAK_CLIENT_SECRET,
 *   baseUrl: env.NEXTAUTH_URL,
 *   secret: env.NEXTAUTH_SECRET,
 *   cookiePrefix: "nazar",
 *   pages: { signIn: "/auth/signin" },
 *   kcLocale: true,
 * });
 * ```
 *
 * Nothing reaches the IdP until the first request needs it.
 */
export function createAuth(config: AuthConfig): Auth {
  const resolved = resolveConfig(config);
  const oidc = createOidc(resolved);
  const sessionCookie = createSessionCookie(resolved);
  return {
    ...createServerReads(resolved, sessionCookie),
    handlers: createRouteHandlers(resolved, oidc, sessionCookie),
    proxy: createAuthProxy(
      resolved,
      sessionCookie,
      createSessionRenewal(resolved, oidc)
    ),
  };
}
