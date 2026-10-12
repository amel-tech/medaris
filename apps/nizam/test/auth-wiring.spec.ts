import { RETURN_TO_HEADER, resetRenewalCache } from "@medaris/auth/testing";
import { ResponseError } from "@medaris/services/tedrisat";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * nizam on `@medaris/auth` (auth Phase 1), driven through its own files: the
 * proxy and its matcher, the catch-all route, a real sign-in round trip
 * against a Keycloak stand-in on `fetch`, then the reads, the actions and the
 * sign-out with the session that round trip left. Nothing leaves the process:
 * every request to the issuer is answered here, and the tedrisat client is
 * replaced.
 */

const ORIGIN = process.env.NEXTAUTH_URL as string;
const ISSUER = process.env.KEYCLOAK_ISSUER as string;
const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID as string;

const state = vi.hoisted(() => ({
  /** the request's cookies, as `cookies()` gives them to Server Components */
  cookie: "",
  returnTo: null as string | null,
  nonce: "",
  /** what the stand-in tedrisat client does on every call */
  api: (() => Promise.resolve({})) as (token: string) => Promise<unknown>,
}));

vi.mock("next/headers", () => {
  const jar = () =>
    state.cookie
      .split("; ")
      .filter(Boolean)
      .map((pair) => {
        const at = pair.indexOf("=");
        return { name: pair.slice(0, at), value: pair.slice(at + 1) };
      });
  return {
    cookies: async () => ({
      get: (name: string) => jar().find((c) => c.name === name),
      getAll: () => jar(),
    }),
    // The header the proxy hands the render: the page being served. Server
    // Components read their destination from it.
    headers: async () =>
      new Headers(state.returnTo ? { [RETURN_TO_HEADER]: state.returnTo } : {}),
  };
});

const createServerTedrisatAPIs = vi.hoisted(() =>
  vi.fn(async (token: string | undefined) => {
    const call = () => state.api(token as string);
    return {
      me: { getMe: call, getMyAssignments: call, getMyRoles: call },
      users: { lookupUser: call },
    };
  })
);
vi.mock("@medaris/services/tedrisat", async (original) => ({
  ...(await original<object>()),
  createServerTedrisatAPIs,
}));

const { handlers, proxy: authProxy } = await import("~/lib/auth");
const { default: proxy, config } = await import("../proxy");
const route = await import("../app/api/auth/[...auth]/route");
const { getAccountData } = await import("~/features/account/reads");
const { getMyAssignments } = await import("~/features/assignments/reads");
const { getMe } = await import("~/features/kosks/actions");
const { authenticatedAction } = await import("~/lib/authenticated-action");
const { lookupUserByEmail } = await import("~/features/madrasahs/actions");

// ---- a Keycloak stand-in ---------------------------------------------------

const encode = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

/** An ID token as Keycloak shapes it; openid-client checks its claims, not its signature, on the token endpoint's answer. */
const idToken = () => {
  const now = Math.floor(Date.now() / 1000);
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: ISSUER,
    aud: CLIENT_ID,
    sub: "user-1",
    iat: now,
    exp: now + 300,
    nonce: state.nonce,
    name: "Hüseyin Gündoğdu",
    email: "h.gundogdu@example.com",
    preferred_username: "hgundogdu",
  })}.c2lnbmF0dXJl`;
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });

const keycloak = vi.fn(async (input: RequestInfo | URL) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.pathname.endsWith("/.well-known/openid-configuration")) {
    return json({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
      token_endpoint: `${ISSUER}/protocol/openid-connect/token`,
      userinfo_endpoint: `${ISSUER}/protocol/openid-connect/userinfo`,
      end_session_endpoint: `${ISSUER}/protocol/openid-connect/logout`,
      jwks_uri: `${ISSUER}/protocol/openid-connect/certs`,
    });
  }
  if (url.pathname.endsWith("/protocol/openid-connect/token")) {
    return json({
      access_token: "access-1",
      token_type: "Bearer",
      expires_in: 300,
      refresh_token: "refresh-1",
      refresh_expires_in: 1800,
      id_token: idToken(),
    });
  }
  throw new Error(`unexpected request to the IdP: ${url}`);
});

// ---- helpers ------------------------------------------------------------------

/** The cookies a response sets, as the browser sends them back (removals left out). */
const cookiesOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((line) => line.split(";")[0] as string)
    .filter((pair) => !pair.endsWith("="))
    .join("; ");

const get = (path: string, cookie = "") =>
  new NextRequest(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : {} });

/** Signs in through the real routes; returns the session cookie. */
async function signIn(): Promise<string> {
  const start = await handlers.GET(
    get("/api/auth/signin?callbackUrl=%2Fen%2Fkosks&locale=en")
  );
  const authorize = new URL(start.headers.get("location") as string);
  state.nonce = authorize.searchParams.get("nonce") as string;
  const back = await handlers.GET(
    get(
      `/api/auth/callback/keycloak?code=the-code&state=${authorize.searchParams.get("state")}`,
      cookiesOf(start)
    )
  );
  expect(back.headers.get("location")).toBe(`${ORIGIN}/en/kosks`);
  return cookiesOf(back);
}

/** Where a server read or page sent the visitor, from Next's redirect error. */
async function redirectOf(pending: Promise<unknown>): Promise<string | null> {
  try {
    await pending;
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return digest.split(";")[2] ?? null;
    }
    throw error;
  }
  return null;
}

const refused = (status: number, body: unknown = {}) =>
  new ResponseError(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
    "Response returned an error code"
  );

beforeEach(() => {
  // Every sign-in here gets the same access token from the stand-in.
  resetRenewalCache();
  vi.stubGlobal("fetch", keycloak);
  keycloak.mockClear();
  createServerTedrisatAPIs.mockClear();
  state.cookie = "";
  state.returnTo = null;
  state.api = () => Promise.resolve({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---- the proxy -----------------------------------------------------------------

describe("proxy.ts (replaces middleware.ts)", () => {
  it("sends a visitor on a protected page to the sign-in page under that page's locale (MDRS-274)", async () => {
    for (const [path, page] of [
      ["/en/kosks", "/en/auth/signin"],
      ["/ar/kosks/k1/ana-sayfa?sekme=x", "/ar/auth/signin"],
      ["/kosks", "/tr/auth/signin"],
    ] as const) {
      const response = await proxy(get(path));
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location") as string);
      expect(location.pathname).toBe(page);
      expect(location.searchParams.get("callbackUrl")).toBe(path);
    }
  });

  it("hands public pages to next-intl for a visitor, and the sign-in page never to itself", async () => {
    const home = await proxy(get("/"));
    expect(new URL(home.headers.get("location") as string).pathname).toBe(
      "/tr"
    );
    for (const path of ["/tr", "/ar/auth/signin", "/en/auth/signout"]) {
      const response = await proxy(get(path));
      expect(response.headers.get("location")).toBeNull();
      expect(response.status).toBe(200);
    }
  });

  it("never redirects an API route, and never hands it to next-intl", async () => {
    const response = await proxy(get("/api/audit-log/export"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("lets a signed-in member through to the page, with no call to Keycloak while the token is fresh", async () => {
    const session = await signIn();
    keycloak.mockClear();
    const response = await proxy(get("/en/kosks", session));
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
    expect(keycloak).not.toHaveBeenCalled();
  });

  it("is the package's proxy with nizam's public pages and next-intl", async () => {
    // `proxy.ts` adds nothing of its own: a visitor gets the same answer
    // from the bare auth step, without next-intl's locale redirect.
    const bare = await authProxy(get("/tr/kosks"));
    const composed = await proxy(get("/tr/kosks"));
    expect(composed.headers.get("location")).toBe(bare.headers.get("location"));
  });
});

describe("the proxy's matcher", () => {
  const matches = (url: string) =>
    unstable_doesMiddlewareMatch({ config, url: `${ORIGIN}${url}` });

  it("runs on pages, on the session route and on the app's own API routes", () => {
    for (const url of [
      "/",
      "/tr/kosks",
      "/tr/kosks/k1/desteler/a.b",
      "/api/auth/session",
      "/api/audit-log/export",
      "/apiary",
      "/_nextthing",
    ]) {
      expect(matches(url), url).toBe(true);
    }
  });

  it("skips Next's assets, static files and the sign-in round trip's own routes", () => {
    for (const url of [
      "/_next/static/chunks/main.js",
      "/favicon.ico",
      "/icon.svg",
      "/apple-icon.png",
      "/mocks/tedrisat.json",
      "/api/auth/signin",
      "/api/auth/callback/keycloak",
      "/api/auth/signout",
    ]) {
      expect(matches(url), url).toBe(false);
    }
  });
});

// ---- the route handlers ---------------------------------------------------------

describe("app/api/auth/[...auth]/route.ts", () => {
  it("is the package's catch-all", () => {
    expect(route.GET).toBe(handlers.GET);
    expect(route.POST).toBe(handlers.POST);
  });

  it("serves no session to a visitor", async () => {
    const response = await route.GET(get("/api/auth/session"));
    expect(await response.json()).toBeNull();
  });

  it("starts a sign-in with PKCE, the registered redirect URI and the visitor's locale", async () => {
    const start = await route.GET(
      get("/api/auth/signin?callbackUrl=%2Far%2Fkosks&locale=ar")
    );
    const authorize = new URL(start.headers.get("location") as string);
    expect(authorize.origin + authorize.pathname).toBe(
      `${ISSUER}/protocol/openid-connect/auth`
    );
    expect(Object.fromEntries(authorize.searchParams)).toMatchObject({
      client_id: CLIENT_ID,
      redirect_uri: `${ORIGIN}/api/auth/callback/keycloak`,
      code_challenge_method: "S256",
      ui_locales: "ar",
      kc_locale: "ar",
    });
  });

  it("finishes a round trip at /api/auth/callback/keycloak and serves the profile without a token", async () => {
    const session = await signIn();
    expect(session).toMatch(/^nizam\.session=/);
    const response = await route.GET(get("/api/auth/session", session));
    const body = await response.json();
    expect(body.user).toMatchObject({
      sub: "user-1",
      name: "Hüseyin Gündoğdu",
      email: "h.gundogdu@example.com",
    });
    expect(JSON.stringify(body)).not.toContain("access-1");
  });

  it("sends a failed callback to the sign-in page, and a sixth start to its error, under the locale", async () => {
    const callback = await route.GET(get("/api/auth/callback/keycloak"));
    expect(callback.headers.get("location")).toBe(
      `${ORIGIN}/tr/auth/signin?error=OAuthCallback`
    );

    const limited = await route.GET(
      get(
        "/api/auth/signin?callbackUrl=%2Fen%2Fkosks",
        `nizam.auth-starts=5.${Date.now()}`
      )
    );
    const target = new URL(limited.headers.get("location") as string);
    expect(target.pathname).toBe("/en/auth/signin");
    expect(target.searchParams.get("error")).toBe("SignInLimit");
    expect(keycloak).not.toHaveBeenCalled();
  });
});

describe("sign-out (POST /api/auth/signout)", () => {
  const signOut = (cookie: string, locale?: string) => {
    const body = new URLSearchParams(locale ? { locale } : {});
    return route.POST(
      new NextRequest(`${ORIGIN}/api/auth/signout`, {
        method: "POST",
        body,
        headers: {
          cookie,
          origin: ORIGIN,
          "content-type": "application/x-www-form-urlencoded",
        },
      })
    );
  };

  it("ends the session and goes to Keycloak's end-session with the ID token from the cookie, back to NEXTAUTH_URL", async () => {
    const session = await signIn();
    const response = await signOut(session, "en");
    const target = new URL(response.headers.get("location") as string);
    expect(target.origin + target.pathname).toBe(
      `${ISSUER}/protocol/openid-connect/logout`
    );
    expect(target.searchParams.get("id_token_hint")).toMatch(/^ey/);
    expect(target.searchParams.get("post_logout_redirect_uri")).toBe(ORIGIN);
    expect(target.searchParams.get("ui_locales")).toBe("en");
    expect(response.headers.getSetCookie().join("\n")).toMatch(
      /^nizam\.session=;/m
    );
  });

  it("without a session signs out here only, never with an empty id_token_hint", async () => {
    const response = await signOut("");
    expect(response.headers.get("location")).toBe(`${ORIGIN}/`);
  });

  it("refuses a GET, so no link can sign anyone out", async () => {
    const response = await route.GET(get("/api/auth/signout"));
    expect(response.status).toBe(405);
  });
});

// ---- reads and actions -------------------------------------------------------------

describe("a server read with the session over (A16, B4)", () => {
  it("goes to sign-in with the page as callbackUrl, and never calls tedrisat without a token", async () => {
    state.returnTo = "/en/hesap";
    expect(await redirectOf(getAccountData())).toBe(
      "/en/auth/signin?callbackUrl=%2Fen%2Fhesap"
    );
    expect(createServerTedrisatAPIs).not.toHaveBeenCalled();
  });

  it("a token tedrisat refuses (401) is sign-in for new tokens (reauth), not 'izniniz yok'", async () => {
    state.cookie = await signIn();
    state.returnTo = "/tr/kosks/k1";
    state.api = () => Promise.reject(refused(401));
    expect(await redirectOf(getMe())).toBe(
      "/tr/auth/signin?callbackUrl=%2Ftr%2Fkosks%2Fk1&reauth=1"
    );
    expect(createServerTedrisatAPIs).toHaveBeenCalledWith(
      "access-1",
      expect.any(String)
    );
  });

  it("the shell's read draws the frame without the data instead, since the shell wraps the sign-in page too", async () => {
    state.cookie = await signIn();
    state.returnTo = "/tr/auth/signin";
    state.api = () => Promise.reject(refused(401));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await getMyAssignments("fail")).toBeNull();
  });
});

describe("a Server Action with the session over", () => {
  it("answers { kind: 'unauthenticated' } without a session, and calls nothing", async () => {
    expect(await authenticatedAction((api) => api.me.getMe())).toEqual({
      kind: "unauthenticated",
    });
    expect(await lookupUserByEmail("a@b.c")).toEqual({
      kind: "unauthenticated",
    });
    expect(createServerTedrisatAPIs).not.toHaveBeenCalled();
  });

  it("answers the same, marked for new tokens, when tedrisat refuses the token, and keeps every other failure an ordinary one", async () => {
    state.cookie = await signIn();

    state.api = () => Promise.reject(refused(401));
    expect(await authenticatedAction((api) => api.me.getMe())).toEqual({
      kind: "unauthenticated",
      reauth: true,
    });

    state.api = () =>
      Promise.reject(refused(403, { code: "FORBIDDEN", message: "no" }));
    expect(await authenticatedAction((api) => api.me.getMe())).toMatchObject({
      success: false,
      errorBody: { code: "FORBIDDEN" },
    });

    state.api = (token) => Promise.resolve({ token });
    expect(await authenticatedAction((api) => api.me.getMe())).toEqual({
      success: true,
      data: { token: "access-1" },
    });
  });
});
