import { type AuthConfig, resolveConfig } from "./config";
import { createOidc } from "./oidc";
import { type AuthProxy, createAuthProxy } from "./proxy";
import { createServerReads, type ServerReads } from "./reads";
import { createSessionRenewal } from "./renewal";
import { type AuthRouteHandlers, createRouteHandlers } from "./routes";
import { createSessionCookie } from "./session-cookie";
import { createSessionStore } from "./session-store";

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
 *   sessionStore: {
 *     url: env.AUTH_STORE_URL,
 *     keyPrefix: env.AUTH_STORE_KEY_PREFIX,
 *   },
 * });
 * ```
 *
 * Nothing reaches the IdP or the session store until the first request
 * needs it.
 */
export function createAuth(config: AuthConfig): Auth {
  const resolved = resolveConfig(config);
  const oidc = createOidc(resolved);
  const store = createSessionStore(resolved, createSessionCookie(resolved));
  return {
    ...createServerReads(resolved, store),
    handlers: createRouteHandlers(resolved, oidc, store),
    proxy: createAuthProxy(
      resolved,
      store,
      // The `userinfo` probe only where back-channel logout cannot arrive.
      createSessionRenewal(resolved, oidc, {
        sessionCheck: store.mode === "cookie",
      })
    ),
  };
}
