import { type NextRequest, NextResponse } from "next/server";
import * as client from "openid-client";
import {
  ACCOUNT_ACTION_PARAM,
  isAccountAction,
} from "../shared/account-action";
import type { AuthErrorCode } from "../shared/auth-error";
import { AUTH_ROUTES, REAUTH_PARAM } from "../shared/routes";
import {
  InvalidLogoutTokenError,
  JTI_TTL_MS,
  verifyLogoutToken,
} from "./backchannel";
import type { ResolvedAuthConfig } from "./config";
import { type CookieWrite, cookieAttributes, writeCookies } from "./cookies";
import { callbackErrorCode, failureSummary, type Oidc } from "./oidc";
import { acceptedLocale, safeReturnTo } from "./return-to";
import { deriveKey, seal, unseal } from "./seal";
import {
  hasUsableAccessToken,
  publicSession,
  sessionFromTokens,
  type TokenSet,
} from "./session-cookie";
import type { LoadedSession, SessionStore } from "./session-store";
import { isSessionStoreUnavailable } from "./store-backend";

/**
 * The five route handlers: start a sign-in, take the IdP's answer, sign out,
 * serve the client-safe session, and take the IdP's back-channel logout.
 *
 * Every round trip keeps its own `state`, nonce and PKCE verifier in its own
 * short-lived sealed cookie, named after the state. NextAuth kept one per
 * origin, so two tabs signing in together overwrote each other's and the
 * first came back to "Giriş yapılamadı" (#180, B3); here they cannot meet.
 */

/** A sign-in round trip in progress, sealed into its own cookie. */
interface Flow {
  state: string;
  nonce: string;
  verifier: string;
  /** Validated destination after the callback. */
  returnTo: string;
  locale: string | null;
  startedAt: number;
}

/** How long a round trip may take on the IdP's forms. */
const FLOW_MAX_AGE = 10 * 60;
/** Round trips one browser may hold open at once; older ones are dropped. */
const MAX_OPEN_FLOWS = 3;

/**
 * The hard cap: at most this many visits to the start route in a window, per
 * browser, whether they started a round trip or went straight on because the
 * browser was signed in already. Past it the start route refuses with
 * `SignInLimit` and nothing starts another on its own. It is the backstop
 * under the client's own budget (one automatic retry, a few automatic starts
 * and go-ons per tab): an IdP that is down, a client secret that no longer
 * matches, a session cookie the browser keeps refusing, or an API that
 * refuses a token the IdP still accepts cannot turn into an endless redirect.
 */
export const MAX_STARTS_PER_WINDOW = 5;
export const STARTS_WINDOW_MS = 5 * 60_000;

/** `state` as openid-client makes it (base64url); anything else is not ours. */
const STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const flowId = (state: string) => state.slice(0, 16);

export interface AuthRouteHandlers {
  /** `GET /api/auth/signin?callbackUrl=&locale=&intent=register&reauth=1&action=UPDATE_PROFILE` */
  signIn(request: NextRequest): Promise<Response>;
  /** `GET /api/auth/callback/keycloak` */
  callback(request: NextRequest): Promise<Response>;
  /** `POST /api/auth/signout` (form field `locale`) */
  signOut(request: NextRequest): Promise<Response>;
  /** `GET /api/auth/session` */
  session(request: NextRequest): Promise<Response>;
  /** `POST /api/auth/backchannel-logout` (form field `logout_token`), from the IdP */
  backchannelLogout(request: NextRequest): Promise<Response>;
  /** All five behind one catch-all route (`app/api/auth/[...auth]/route.ts`). */
  GET(request: NextRequest): Promise<Response>;
  POST(request: NextRequest): Promise<Response>;
}

const parseStarts = (value: string | undefined, now: number) => {
  const [count, since] = (value ?? "").split(".").map(Number);
  return typeof count === "number" &&
    typeof since === "number" &&
    Number.isInteger(count) &&
    count >= 0 &&
    since <= now &&
    now - since < STARTS_WINDOW_MS
    ? { count, since }
    : { count: 0, since: now };
};

/** The session the request's cookies name; `null` too when the store cannot be asked. */
const loadOrNull = async (
  store: SessionStore,
  request: NextRequest
): Promise<LoadedSession | null> => {
  try {
    return await store.load(request.cookies);
  } catch (error) {
    if (isSessionStoreUnavailable(error)) return null;
    throw error;
  }
};

export function createRouteHandlers(
  config: ResolvedAuthConfig,
  oidc: Oidc,
  store: SessionStore
): AuthRouteHandlers {
  let flowKey: Promise<Uint8Array> | undefined;
  const flowKeyOf = () => {
    flowKey ??= deriveKey(config.secret, config.cookiePrefix, "flow");
    return flowKey;
  };

  const absolute = (path: string) => new URL(path, config.origin);

  /** The app's sign-in page, saying what went wrong and where to go after. */
  const errorPage = (code: AuthErrorCode, returnTo: string | null) => {
    const target = absolute(config.signInPage(returnTo));
    target.searchParams.set("error", code);
    if (returnTo) target.searchParams.set("callbackUrl", returnTo);
    return target;
  };

  const redirect = (target: URL | string) =>
    NextResponse.redirect(target, { status: 303 });

  const removeCookie = (response: NextResponse, name: string) =>
    response.cookies.set(name, "", cookieAttributes(config.secure, 0));

  const signIn: AuthRouteHandlers["signIn"] = async (request) => {
    const now = config.now();
    const params = request.nextUrl.searchParams;
    const locale = acceptedLocale(params.get("locale"), config.locales);
    const returnTo = safeReturnTo(params.get("callbackUrl"), config.origin);
    const destination = returnTo ?? config.afterSignIn(locale);
    const register = params.get("intent") === "register";
    // The API refused this session's token: new tokens, not straight back.
    const reauth = params.get(REAUTH_PARAM) === "1";
    // An account action (Keycloak's AIA, `shared/account-action.ts`): the
    // IdP's form for it, then back through the callback with new tokens.
    // Anything but an allowed action is no action.
    const requested = params.get(ACCOUNT_ACTION_PARAM);
    const action = !register && isAccountAction(requested) ? requested : null;

    const starts = parseStarts(
      request.cookies.get(config.cookies.starts)?.value,
      now
    );
    if (starts.count >= MAX_STARTS_PER_WINDOW) {
      return redirect(errorPage("SignInLimit", returnTo));
    }
    const countThisVisit = (response: NextResponse) => {
      response.cookies.set(
        config.cookies.starts,
        `${starts.count + 1}.${starts.since}`,
        cookieAttributes(
          config.secure,
          Math.ceil((starts.since + STARTS_WINDOW_MS - now) / 1000)
        )
      );
      return response;
    };

    let existing: LoadedSession | null;
    try {
      existing = await store.load(request.cookies);
    } catch (error) {
      if (!isSessionStoreUnavailable(error)) throw error;
      // A round trip now would end at a callback that cannot store its
      // session: say "could not start" here instead of sending anyone
      // through the IdP for nothing.
      return redirect(errorPage("OAuthSignin", returnTo));
    }

    // Already signed in (another tab's round trip finished, or a stale link):
    // go on rather than through the IdP again, counted like a start, since a
    // page that keeps sending a signed-in browser here would otherwise loop
    // through this step for free. Not for "Kayıt ol", which asks for the
    // registration form on purpose, nor for `reauth`, where the session is
    // what the API refused, nor for an account action, whose form is the
    // point of the visit.
    if (
      !register &&
      !reauth &&
      !action &&
      existing &&
      hasUsableAccessToken(existing.session, now)
    ) {
      return countThisVisit(redirect(absolute(destination)));
    }

    let configuration: client.Configuration;
    try {
      configuration = await oidc.configuration();
    } catch (error) {
      console.error(
        "@medaris/auth: OIDC discovery failed",
        failureSummary(error)
      );
      return redirect(errorPage("OAuthSignin", returnTo));
    }

    const state = client.randomState();
    const nonce = client.randomNonce();
    const verifier = client.randomPKCECodeVerifier();
    const parameters: Record<string, string> = {
      redirect_uri: config.redirectUri,
      scope: config.scope,
      code_challenge: await client.calculatePKCECodeChallenge(verifier),
      code_challenge_method: "S256",
      state,
      nonce,
    };
    if (locale) {
      parameters.ui_locales = locale;
      if (config.kcLocale) parameters.kc_locale = locale;
    }
    // OIDC "Initiating User Registration" (MDRS-101): the registration form
    // directly, rather than the login form and a link to find.
    if (register) parameters.prompt = "create";
    // Keycloak's application-initiated action, e.g. UPDATE_PROFILE.
    if (action) parameters.kc_action = action;

    const flow: Flow = {
      state,
      nonce,
      verifier,
      returnTo: destination,
      locale,
      startedAt: now,
    };
    const response = countThisVisit(
      redirect(client.buildAuthorizationUrl(configuration, parameters))
    );
    response.cookies.set(
      `${config.cookies.flowPrefix}${flowId(state)}`,
      await seal({ ...flow }, await flowKeyOf(), {
        now,
        expiresAt: now + FLOW_MAX_AGE * 1000,
      }),
      cookieAttributes(config.secure, FLOW_MAX_AGE)
    );

    // Round trips abandoned on the IdP's form leave their cookie until it
    // expires; keep the newest few and drop the rest.
    const open: Array<{ name: string; startedAt: number }> = [];
    for (const { name, value } of request.cookies.getAll()) {
      if (!name.startsWith(config.cookies.flowPrefix)) continue;
      const other = await unseal<Flow>(value, await flowKeyOf(), now);
      open.push({ name, startedAt: other?.startedAt ?? 0 });
    }
    open.sort((a, b) => b.startedAt - a.startedAt);
    for (const stale of open.slice(MAX_OPEN_FLOWS - 1)) {
      removeCookie(response, stale.name);
    }
    return response;
  };

  const callback: AuthRouteHandlers["callback"] = async (request) => {
    const now = config.now();
    const params = request.nextUrl.searchParams;
    const state = params.get("state");
    const cookieName =
      state && STATE_PATTERN.test(state)
        ? `${config.cookies.flowPrefix}${flowId(state)}`
        : null;
    const sealed = cookieName
      ? request.cookies.get(cookieName)?.value
      : undefined;
    const flow = sealed
      ? await unseal<Flow>(sealed, await flowKeyOf(), now)
      : null;

    if (!flow || flow.state !== state) {
      // No round trip of this browser's has this state: the Back button
      // replaying a callback that already signed in (MDRS-249 B), or a link
      // from somewhere else. Signed in already: go on, quietly.
      const loaded = await loadOrNull(store, request);
      const response =
        loaded && hasUsableAccessToken(loaded.session, now)
          ? redirect(absolute(config.afterSignIn(null)))
          : redirect(errorPage("OAuthCallback", null));
      if (cookieName && sealed) removeCookie(response, cookieName);
      return response;
    }

    try {
      const configuration = await oidc.configuration();
      // The registered redirect URI plus the IdP's parameters: behind the
      // deployment's proxy `request.url` names an internal host, and
      // openid-client sends this URL (without its query) as `redirect_uri`.
      const currentUrl = new URL(config.redirectUri);
      for (const [key, value] of params) {
        currentUrl.searchParams.append(key, value);
      }
      const tokens = await client.authorizationCodeGrant(
        configuration,
        currentUrl,
        {
          expectedState: flow.state,
          expectedNonce: flow.nonce,
          pkceCodeVerifier: flow.verifier,
          idTokenExpected: true,
        }
      );
      const session = sessionFromTokens(tokens as unknown as TokenSet, now);
      if (!session) throw new Error("the ID token names no subject");

      // A new session under a new id; the one this browser had (a `reauth`,
      // or a sign-in as someone else) is ended with it. A store that cannot
      // be asked fails the sign-in here like any other callback failure.
      const { writes } = await store.create(
        request.cookies,
        session,
        await store.load(request.cookies)
      );
      const response = redirect(absolute(flow.returnTo));
      writeCookies(response.cookies, writes, config.secure);
      removeCookie(response, cookieName as string);
      return response;
    } catch (error) {
      const code = callbackErrorCode(error);
      console.error("@medaris/auth: sign-in callback failed", {
        ...failureSummary(error),
        reported: code,
      });
      const response = redirect(errorPage(code, flow.returnTo));
      removeCookie(response, cookieName as string);
      return response;
    }
  };

  const signOut: AuthRouteHandlers["signOut"] = async (request) => {
    if (request.method !== "POST") {
      return new NextResponse(null, {
        status: 405,
        headers: { Allow: "POST" },
      });
    }
    // A sign-out on another site's say-so is refused. The session cookie is
    // SameSite=Lax and would not come along anyway; this keeps a cross-site
    // form from even reaching the IdP's end-session endpoint in our name.
    const origin = request.headers.get("origin");
    if (
      (origin && origin !== config.origin) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    ) {
      return new NextResponse(null, { status: 403 });
    }

    let locale: string | null = null;
    try {
      const form = await request.formData();
      locale = acceptedLocale(form.get("locale"), config.locales);
    } catch {
      // no body: no locale
    }

    let loaded: LoadedSession | null = null;
    let unreadable = false;
    try {
      loaded = await store.load(request.cookies);
    } catch (error) {
      if (!isSessionStoreUnavailable(error)) throw error;
      unreadable = true;
    }
    const idToken = loaded?.session.idToken;
    let target = absolute(config.afterSignOut);
    // Without an ID token there is no hint to send, and Keycloak would answer
    // with its own English "Do you want to log out?" page (A20, B7): sign out
    // here only. Never an empty `id_token_hint=`. The one exception is a
    // session store that cannot be asked: the ID token is in it, and signing
    // out here only would leave the IdP session alive for the next "Giriş
    // yap", so the IdP is asked without a hint and shows its confirmation.
    if (idToken || unreadable) {
      try {
        const configuration = await oidc.configuration();
        if (configuration.serverMetadata().end_session_endpoint) {
          const parameters: Record<string, string> = {
            post_logout_redirect_uri: config.postLogoutRedirectUri,
          };
          if (idToken) parameters.id_token_hint = idToken;
          if (locale) parameters.ui_locales = locale;
          target = client.buildEndSessionUrl(configuration, parameters);
        }
      } catch (error) {
        console.error(
          "@medaris/auth: end-session URL unavailable, signing out locally",
          failureSummary(error)
        );
      }
    }

    // The store entry and its index entries go first (the IdP then tells the
    // other apps through back-channel logout); the cookie goes whatever the
    // store answers.
    let writes: CookieWrite[] = store.clearCookie(request.cookies);
    if (loaded) {
      try {
        writes = await store.remove(request.cookies, loaded);
      } catch (error) {
        if (!isSessionStoreUnavailable(error)) throw error;
      }
    }
    const response = redirect(target);
    writeCookies(response.cookies, writes, config.secure);
    return response;
  };

  const session: AuthRouteHandlers["session"] = async (request) => {
    let loaded: LoadedSession | null;
    try {
      loaded = await store.load(request.cookies);
    } catch (error) {
      if (!isSessionStoreUnavailable(error)) throw error;
      // Not `null`: that would read as "signed out" and reload the page. The
      // client takes an answer that is not 200 as "could not ask".
      return NextResponse.json(
        { error: "temporarily_unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }
    const body =
      loaded && hasUsableAccessToken(loaded.session, config.now())
        ? publicSession(loaded.session)
        : null;
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  };

  /**
   * OIDC Back-Channel Logout 1.0: the IdP, not a browser, posts a signed
   * `logout_token` when an SSO session ends (a sign-out in another Medaris
   * app, an admin, an expiry). Every session of this app behind that IdP
   * session (`sid`), or of that account when the token names no `sid`, ends
   * at once, instead of within a minute through the `userinfo` probe.
   *
   * 200 with `Cache-Control: no-store` when done; 400 with an OAuth error
   * body for a token that fails a check (§2.8), a repeated `jti` included;
   * 503 when the IdP's keys or the store cannot be reached. With the session
   * in the cookie there is nothing to look a session up in: a valid token is
   * answered 501, so the IdP's log says this app did not end its session.
   */
  const backchannelLogout: AuthRouteHandlers["backchannelLogout"] = async (
    request
  ) => {
    const headers = { "Cache-Control": "no-store" };
    const answer = (status: number, error?: string, description?: string) =>
      error
        ? NextResponse.json(
            {
              error,
              ...(description ? { error_description: description } : {}),
            },
            { status, headers }
          )
        : new NextResponse(null, { status, headers });

    if (request.method !== "POST") {
      return new NextResponse(null, {
        status: 405,
        headers: { ...headers, Allow: "POST" },
      });
    }
    let token: string | null = null;
    try {
      const value = (await request.formData()).get("logout_token");
      token = typeof value === "string" && value ? value : null;
    } catch {
      // not a form: no token
    }
    if (!token) {
      return answer(400, "invalid_request", "logout_token is missing");
    }

    try {
      const configuration = await oidc.configuration();
      const claims = await verifyLogoutToken(token, {
        keys: await oidc.jwks(),
        issuer: configuration.serverMetadata().issuer,
        clientId: config.clientId,
        now: config.now(),
      });
      if (!(await store.firstUse(claims.jti, JTI_TTL_MS))) {
        return answer(400, "invalid_request", "logout_token was used before");
      }
      const ended = await store.endIdpSession(claims);
      if (ended === null) {
        return answer(
          501,
          "unsupported",
          "this app keeps its sessions in the cookie and cannot end one from here"
        );
      }
      return answer(200);
    } catch (error) {
      if (error instanceof InvalidLogoutTokenError) {
        return answer(400, "invalid_request", error.message);
      }
      console.error(
        "@medaris/auth: back-channel logout failed",
        failureSummary(error)
      );
      return answer(503, "temporarily_unavailable");
    }
  };

  const notFound = () => new NextResponse(null, { status: 404 });

  return {
    signIn,
    callback,
    signOut,
    session,
    backchannelLogout,
    GET(request) {
      switch (request.nextUrl.pathname) {
        case AUTH_ROUTES.signIn:
          return signIn(request);
        case AUTH_ROUTES.callback:
          return callback(request);
        case AUTH_ROUTES.session:
          return session(request);
        case AUTH_ROUTES.signOut:
          return signOut(request);
        case AUTH_ROUTES.backchannelLogout:
          return backchannelLogout(request);
        default:
          return Promise.resolve(notFound());
      }
    },
    POST(request) {
      switch (request.nextUrl.pathname) {
        case AUTH_ROUTES.signOut:
          return signOut(request);
        case AUTH_ROUTES.backchannelLogout:
          return backchannelLogout(request);
        default:
          return Promise.resolve(notFound());
      }
    },
  };
}
