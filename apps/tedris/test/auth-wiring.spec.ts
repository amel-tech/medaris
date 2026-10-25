import {
  RETURN_TO_HEADER,
  sealSessionCookies,
  sessionFromTokenResponse,
  type TokenResponse,
} from "@medaris/auth/testing";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * tedris on `@medaris/auth`: the instance `lib/auth.ts` builds, the route
 * handler file, and the one "unauthenticated" path through the reads and the
 * actions. The package's own specs cover the flows; these pin what tedris
 * chose (the cookie prefix, the locale of the sign-in page, Ana sayfa after a
 * sign-in that names no page) and that its reads and actions take the path.
 * Nothing reaches Keycloak or tedrisat: `fetch` is a spy that fails the test
 * when a read goes out without a token.
 */

const state = vi.hoisted(() => ({
  cookie: "",
  returnTo: null as string | null,
}));
vi.mock("next/headers", async () => {
  const { NextRequest } = await import("next/server");
  return {
    cookies: async () =>
      new NextRequest("http://localhost:4000/", {
        headers: state.cookie ? { cookie: state.cookie } : {},
      }).cookies,
    headers: async () =>
      new Headers(state.returnTo ? { [RETURN_TO_HEADER]: state.returnTo } : {}),
  };
});

const ORIGIN = "http://localhost:4000";

const unsignedJwt = (claims: Record<string, unknown>) =>
  `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

const tokens = (overrides: Partial<TokenResponse> = {}): TokenResponse => ({
  access_token: "access-token-1",
  refresh_token: "refresh-1",
  id_token: unsignedJwt({
    sub: "talebe-1",
    name: "Ayşe Yılmaz",
    email: "ayse@example.org",
  }),
  expires_in: 300,
  refresh_expires_in: 1800,
  ...overrides,
});

/** The cookie header of a session the app wrote at `now`, sealed by the package itself. */
const sessionCookie = async (now = Date.now(), overrides = {}) =>
  (
    await sealSessionCookies(
      {
        baseUrl: ORIGIN,
        secret: "test-nextauth-secret",
        cookiePrefix: "tedris",
        now: () => now,
      },
      sessionFromTokenResponse(tokens(overrides), now)
    )
  ).header;

/** Where a thrown `redirect()` was going. */
const redirectOf = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2];
    throw error;
  }
  throw new Error("expected a redirect");
};

const fetchSpy = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.resetModules();
  state.cookie = "";
  state.returnTo = null;
  fetchSpy.mockReset();
  fetchSpy.mockRejectedValue(new Error("no request may leave this spec"));
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("lib/auth: where tedris sends a visitor to sign in (MDRS-274)", () => {
  it("opens the sign-in page in the language of the page they were on", async () => {
    const { signInUrl } = await import("~/lib/auth");
    expect(signInUrl("/courses/c1?tab=x")).toBe(
      `/auth/signin?callbackUrl=${encodeURIComponent("/courses/c1?tab=x")}`
    );
    expect(signInUrl("/schedule")).toBe(
      `/auth/signin?callbackUrl=${encodeURIComponent("/schedule")}`
    );
  });

  it("uses Turkish for a path with no locale, and drops a return path off the app", async () => {
    const { signInUrl } = await import("~/lib/auth");
    expect(signInUrl("/api/lessons/l1/calendar")).toBe(
      `/auth/signin?callbackUrl=${encodeURIComponent("/api/lessons/l1/calendar")}`
    );
    expect(signInUrl("https://evil.example/")).toBe("/auth/signin");
    expect(signInUrl("//evil.example/tr")).toBe("/auth/signin");
  });
});

describe("app/api/auth/[...auth]/route.ts", () => {
  const call = async (
    method: "GET" | "POST",
    path: string,
    headers: Record<string, string> = {}
  ) => {
    const route = await import("../app/api/auth/[...auth]/route");
    return route[method](
      new NextRequest(new URL(path, ORIGIN), { method, headers })
    );
  };

  it("serves the session without a token, and null for a visitor", async () => {
    const visitor = await call("GET", "/api/auth/session");
    expect(await visitor.json()).toBeNull();

    const signedIn = await call("GET", "/api/auth/session", {
      cookie: await sessionCookie(),
    });
    const body = await signedIn.json();
    expect(body.user).toEqual({
      sub: "talebe-1",
      name: "Ayşe Yılmaz",
      email: "ayse@example.org",
    });
    expect(JSON.stringify(body)).not.toMatch(/access-token|refresh|e30\./);
  });

  it("sends a browser already signed in on to Ana sayfa, past Keycloak and with no welcome step", async () => {
    const response = await call("GET", "/api/auth/signin?locale=en", {
      cookie: await sessionCookie(),
    });
    expect(response.headers.get("location")).toBe(`${ORIGIN}/`);
  });

  it("signs out a browser with no session here, and lands on /", async () => {
    const response = await call("POST", "/api/auth/signout", {
      origin: ORIGIN,
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/`);
  });

  it("refuses a sign-out another site asks for", async () => {
    const response = await call("POST", "/api/auth/signout", {
      origin: "https://evil.example",
    });
    expect(response.status).toBe(403);
  });

  it("answers 404 for anything else under /api/auth", async () => {
    expect((await call("GET", "/api/auth/providers")).status).toBe(404);
  });
});

describe("the server reads (D1, MDRS-216)", () => {
  it("auth() gives the account, and getAccessToken() the token, of a live session", async () => {
    state.cookie = await sessionCookie();
    const { auth, getAccessToken } = await import("~/lib/auth");
    expect((await auth())?.user.name).toBe("Ayşe Yılmaz");
    expect(await getAccessToken()).toBe("access-token-1");
  });

  it("a session whose access token ran out is a visitor to both", async () => {
    state.cookie = await sessionCookie(Date.now() - 10 * 60_000);
    const { auth, getAccessToken } = await import("~/lib/auth");
    expect(await auth()).toBeNull();
    expect(await getAccessToken()).toBeUndefined();
  });

  it("a cookie written under the old NextAuth name is no session", async () => {
    state.cookie = "tedris.session-token=eyJhbGciOiJkaXIifQ..x.y.z";
    const { auth } = await import("~/lib/auth");
    expect(await auth()).toBeNull();
  });
});

describe("a member read without a session (A16)", () => {
  it("sends the visitor to sign in and back to the page, without asking tedrisat", async () => {
    state.returnTo = "/schedule?from=2026-10-12";
    const { getMySessions } = await import("~/features/schedule/reads");
    expect(await redirectOf(() => getMySessions("a", "b"))).toBe(
      `/auth/signin?callbackUrl=${encodeURIComponent("/schedule?from=2026-10-12")}`
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does the same for the home sections and the account page", async () => {
    state.returnTo = "/account";
    const home = await import("~/features/home/reads");
    const account = await import("~/features/account/reads");
    for (const read of [home.getHomeCourses, account.getMyProfile]) {
      expect(await redirectOf(read)).toBe(
        `/auth/signin?callbackUrl=${encodeURIComponent("/account")}`
      );
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends a token tedrisat refuses (401) to sign in for new tokens (reauth), not to 'could not be read'", async () => {
    state.cookie = await sessionCookie();
    state.returnTo = "/schedule?from=2026-10-12";
    fetchSpy.mockResolvedValue(new Response(null, { status: 401 }));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getMySessions } = await import("~/features/schedule/reads");
    expect(await redirectOf(() => getMySessions("a", "b"))).toBe(
      `/auth/signin?callbackUrl=${encodeURIComponent("/schedule?from=2026-10-12")}&reauth=1`
    );
    expect(errors).not.toHaveBeenCalled();
  });

  it("keeps the header's bell a side read: a refused token leaves it at 0, with no redirect", async () => {
    state.cookie = await sessionCookie();
    fetchSpy.mockResolvedValue(new Response(null, { status: 401 }));
    const { getUnreadNotificationCount } = await import(
      "~/features/notifications/reads"
    );
    expect(await getUnreadNotificationCount()).toBe(0);
  });

  it("leaves the header's bell at 0 for a visitor, with no request and no redirect", async () => {
    const { getUnreadNotificationCount } = await import(
      "~/features/notifications/reads"
    );
    expect(await getUnreadNotificationCount()).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("asks tedrisat with the caller's token when there is a session", async () => {
    state.cookie = await sessionCookie();
    fetchSpy.mockResolvedValue(Response.json([]));
    const { getMySessions } = await import("~/features/schedule/reads");
    expect(await getMySessions("a", "b")).toEqual([]);
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer access-token-1"
    );
  });
});

describe("a Server Action without a session (E2)", () => {
  it("answers `unauthenticated` instead of an English error, and asks nothing", async () => {
    const { authenticatedAction } = await import("~/lib/authenticated-action");
    const action = vi.fn();
    const result = await authenticatedAction(action);
    expect(result).toMatchObject({ kind: "unauthenticated", success: false });
    expect(action).not.toHaveBeenCalled();
  });

  it("answers the same when tedrisat refuses the token, marked for new tokens (reauth)", async () => {
    state.cookie = await sessionCookie();
    fetchSpy.mockResolvedValue(new Response(null, { status: 401 }));
    const { followKosk } = await import("~/features/courses/actions");
    expect(await followKosk("k1")).toMatchObject({
      kind: "unauthenticated",
      reauth: true,
      success: false,
    });
  });

  it("keeps any other refusal an ordinary failure, with its status", async () => {
    state.cookie = await sessionCookie();
    fetchSpy.mockResolvedValue(
      Response.json({ message: "Yasak" }, { status: 403 })
    );
    const { followKosk } = await import("~/features/courses/actions");
    const result = await followKosk("k1");
    expect(result).toMatchObject({ success: false, status: 403 });
    expect(result).not.toHaveProperty("kind");
    expect(result).not.toHaveProperty("code");
  });

  it("passes the API's error code on, so two refusals with one status can be told apart (#317)", async () => {
    state.cookie = await sessionCookie();
    fetchSpy.mockResolvedValue(
      Response.json(
        {
          code: "GENDER_MANAGED_BY_ACCOUNT",
          message: "The gender is kept in the account; change it there",
        },
        { status: 409 }
      )
    );
    const { followKosk } = await import("~/features/courses/actions");
    expect(await followKosk("k1")).toMatchObject({
      success: false,
      status: 409,
      code: "GENDER_MANAGED_BY_ACCOUNT",
    });
  });
});
