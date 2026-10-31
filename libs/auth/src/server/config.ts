/**
 * What an app tells `createAuth`, and the values derived from it once.
 *
 * The package reads no environment variable itself: each app passes the
 * values from its own validated `~/env` (which `@medaris/env` fills from the
 * root `.env`, `<APP>__KEYCLOAK_CLIENT_ID` → `KEYCLOAK_CLIENT_ID`). So the
 * same build reads `NAZAR__…` in nazar and `TEDRIS__…` in tedris without the
 * package knowing either prefix.
 */
import { AUTH_ROUTES } from "../shared/routes";
import {
  DEFAULT_SIGN_IN_LIMIT,
  type SignInLimit,
} from "../shared/sign-in-limit";
import type { StoreBackend } from "./store-backend";

/**
 * Where the sessions live (auth Phase 2).
 *
 * With a store (`url`, or `backend` in the specs) they live in Valkey: the
 * cookie holds only a random id, a refresh is stored once for every replica,
 * and a back-channel logout from the IdP can find a session by its `sid`.
 * Without one they are sealed into the cookie itself, as in Phase 1: local
 * development without Valkey, and most specs.
 */
export interface SessionStoreConfig {
  /**
   * `WEB__AUTH_STORE_URL`: `redis://<user>:<password>@<host>:6379/0`
   * (`rediss://` over TLS). Empty or absent: no store.
   */
  url?: string;
  /**
   * `WEB__AUTH_STORE_KEY_PREFIX`: `dev` or `prod`. Every key starts with
   * `<keyPrefix>:auth:<cookiePrefix>:`, and the Valkey ACL lets each
   * environment's user touch only its own prefix, so a store without one
   * refuses to start rather than write where its user may not.
   */
  keyPrefix?: string;
  /** The key-value store to use instead of connecting to `url` (the specs' in-memory one). */
  backend?: StoreBackend;
}

export interface ResolvedStoreConfig {
  /** `<keyPrefix>:auth:<cookiePrefix>:`, in front of every key. */
  namespace: string;
  url?: string;
  backend?: StoreBackend;
}

export interface AuthPages {
  /**
   * The app's sign-in page: the one that renders the sign-in entry (the
   * parallel-tab guard and the error box). Everything that sends a visitor to
   * sign in goes here with `?callbackUrl=` (and `?error=` after a failure).
   * The addresses carry no language (MDRS-248).
   */
  signIn: string;
  /** Where a sign-in that names no page ends. Default `/`. */
  afterSignIn?: string;
  /**
   * Where a sign-out that could not reach the IdP lands (no ID token for the
   * `id_token_hint`, or no `end_session_endpoint`). Default `/`.
   */
  afterSignOut?: string;
}

export interface AuthConfig {
  /** `KEYCLOAK_ISSUER`. Every endpoint comes from its discovery document. */
  issuer: string;
  /** `KEYCLOAK_CLIENT_ID`. */
  clientId: string;
  /** `KEYCLOAK_CLIENT_SECRET`. */
  clientSecret: string;
  /**
   * `NEXTAUTH_URL`: the app's public origin, as the Keycloak client has it
   * registered. The redirect URI is `<baseUrl>/api/auth/callback/keycloak`,
   * and the post-logout redirect URI is this string unchanged.
   */
  baseUrl: string;
  /** `NEXTAUTH_SECRET`: key material for the cookies, through HKDF. */
  secret: string;
  /**
   * The app's name, the first part of every cookie it sets:
   * `nazar` → `__Host-nazar.session` (`nazar.session` over plain http).
   * Distinct per app, so three apps on one `localhost` never read each
   * other's cookie (MDRS-24).
   */
  cookiePrefix: string;
  pages: AuthPages;
  /**
   * The UI locales the IdP may be asked to show (`ui_locales`). A locale not
   * in the list is dropped rather than passed on. Omitted: any well-formed
   * language tag is passed.
   */
  locales?: readonly string[];
  /**
   * Keycloak only: send the locale as `kc_locale` too. Keycloak ranks it above
   * its own `KEYCLOAK_LOCALE` cookie and keeps it for the forms that follow
   * (login → register → back); `ui_locales` alone showed a Turkish form to an
   * English visitor (MDRS-274). Other IdPs ignore it, but it stays opt-in so
   * the code path is named rather than implied.
   */
  kcLocale?: boolean;
  /** `post_logout_redirect_uri`. Default: `baseUrl`, exactly as given. */
  postLogoutRedirectUri?: string;
  /** The requested scope. Default `openid profile email`. */
  scope?: string;
  /**
   * Seconds a session cookie lives when the IdP gives the refresh token no
   * deadline of its own. Default 30 days, NextAuth's default.
   */
  sessionMaxAge?: number;
  /** Seconds before any call to the IdP is abandoned. Default 10 (B5). */
  httpTimeout?: number;
  /** A clock for the specs. Default `Date.now`. */
  now?: () => number;
  /** Where the sessions live; see `SessionStoreConfig`. Default: the cookie. */
  sessionStore?: SessionStoreConfig;
  /**
   * The start route's cap per browser (`AUTH_SIGN_IN_LIMIT`, read with
   * `parseSignInLimit`). Default 5 in 5 minutes; see `shared/sign-in-limit.ts`.
   */
  signInLimit?: SignInLimit;
}

/** Refresh when the access token has less than this left. */
export const REFRESH_WINDOW_MS = 60_000;
/**
 * Ask the IdP's `userinfo` endpoint at most this often whether the SSO session
 * still exists (MDRS-210): how late a sign-out in another app is noticed.
 */
export const SESSION_CHECK_INTERVAL_MS = 60_000;

export interface ResolvedAuthConfig {
  issuer: URL;
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  origin: string;
  secret: string;
  cookiePrefix: string;
  /** `https` base URL: Secure cookies and the `__Host-` prefix. */
  secure: boolean;
  cookies: {
    session: string;
    /** Followed by the flow id: one cookie per sign-in round trip. */
    flowPrefix: string;
    starts: string;
  };
  redirectUri: string;
  scope: string;
  locales: readonly string[] | undefined;
  kcLocale: boolean;
  postLogoutRedirectUri: string;
  signInPage: string;
  afterSignIn: string;
  afterSignOut: string;
  sessionMaxAge: number;
  httpTimeout: number;
  now: () => number;
  /** `null`: the session is sealed into the cookie (Phase 1). */
  store: ResolvedStoreConfig | null;
  signInLimit: SignInLimit;
}

const COOKIE_PREFIX_PATTERN = /^[a-z][a-z0-9-]*$/;
const KEY_PREFIX_PATTERN = /^[a-z][a-z0-9-]*$/;

const required = (value: string, name: string): string => {
  if (!value) throw new Error(`@medaris/auth: ${name} is empty`);
  return value;
};

/**
 * The part of `AuthConfig` the cookies are made from. `@medaris/auth/testing`
 * takes only this, so a spec or a Playwright helper can seal a session
 * without naming an IdP; an app's whole `AuthConfig` fits it too.
 */
export type CookieConfig = Pick<
  AuthConfig,
  "baseUrl" | "secret" | "cookiePrefix" | "sessionMaxAge" | "now"
>;

export type ResolvedCookieConfig = Pick<
  ResolvedAuthConfig,
  | "baseUrl"
  | "origin"
  | "secret"
  | "cookiePrefix"
  | "secure"
  | "cookies"
  | "sessionMaxAge"
  | "now"
>;

export function resolveCookieConfig(
  config: CookieConfig
): ResolvedCookieConfig {
  const base = new URL(required(config.baseUrl, "baseUrl"));
  if (base.pathname !== "/" || base.search || base.hash) {
    // The redirect URI is built from the origin; a path here would silently
    // send Keycloak a redirect URI it has not registered.
    throw new Error(
      `@medaris/auth: baseUrl must be an origin, got ${config.baseUrl}`
    );
  }
  if (!COOKIE_PREFIX_PATTERN.test(config.cookiePrefix)) {
    throw new Error(
      `@medaris/auth: cookiePrefix must be a lowercase name, got ${config.cookiePrefix}`
    );
  }
  const secure = base.protocol === "https:";
  // `__Host-`: Secure, Path=/ and no Domain, so a sibling subdomain cannot set
  // or shadow the cookie. Browsers refuse the prefix over plain http, which is
  // why local development (http://localhost:400x) goes without it.
  const name = (suffix: string) =>
    `${secure ? "__Host-" : ""}${config.cookiePrefix}.${suffix}`;
  return {
    baseUrl: config.baseUrl,
    origin: base.origin,
    secret: required(config.secret, "secret"),
    cookiePrefix: config.cookiePrefix,
    secure,
    cookies: {
      session: name("session"),
      flowPrefix: name("auth-flow."),
      starts: name("auth-starts"),
    },
    sessionMaxAge: config.sessionMaxAge ?? 30 * 24 * 60 * 60,
    now: config.now ?? Date.now,
  };
}

/**
 * The store, or `null` for the cookie. Throws when a store is named without a
 * usable key prefix, or with a URL that is not `redis://` / `rediss://`: both
 * would otherwise surface only as refused writes on the first sign-in. The
 * URL carries the password, so no message here repeats it.
 */
function resolveStore(
  store: SessionStoreConfig | undefined,
  cookiePrefix: string
): ResolvedStoreConfig | null {
  const url = store?.url?.trim() || undefined;
  if (!url && !store?.backend) return null;
  const keyPrefix = store?.keyPrefix?.trim() ?? "";
  if (!KEY_PREFIX_PATTERN.test(keyPrefix)) {
    throw new Error(
      `@medaris/auth: a session store needs a key prefix (WEB__AUTH_STORE_KEY_PREFIX, a lowercase name such as "prod"), got ${JSON.stringify(keyPrefix)}`
    );
  }
  if (url && !/^rediss?:\/\//.test(url)) {
    throw new Error(
      "@medaris/auth: the session store URL (WEB__AUTH_STORE_URL) must start with redis:// or rediss://"
    );
  }
  return {
    namespace: `${keyPrefix}:auth:${cookiePrefix}:`,
    ...(url ? { url } : {}),
    ...(store?.backend ? { backend: store.backend } : {}),
  };
}

export function resolveConfig(config: AuthConfig): ResolvedAuthConfig {
  const cookie = resolveCookieConfig(config);
  const { signIn, afterSignIn } = config.pages;

  return {
    ...cookie,
    issuer: new URL(required(config.issuer, "issuer")),
    clientId: required(config.clientId, "clientId"),
    clientSecret: required(config.clientSecret, "clientSecret"),
    redirectUri: `${cookie.origin}${AUTH_ROUTES.callback}`,
    scope: config.scope ?? "openid profile email",
    locales: config.locales,
    kcLocale: config.kcLocale ?? false,
    postLogoutRedirectUri: config.postLogoutRedirectUri ?? config.baseUrl,
    signInPage: signIn,
    afterSignIn: afterSignIn ?? "/",
    afterSignOut: config.pages.afterSignOut ?? "/",
    httpTimeout: config.httpTimeout ?? 10,
    store: resolveStore(config.sessionStore, cookie.cookiePrefix),
    signInLimit: config.signInLimit ?? DEFAULT_SIGN_IN_LIMIT,
  };
}
