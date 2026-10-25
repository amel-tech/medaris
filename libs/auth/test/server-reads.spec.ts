import { createAuth, isUnauthenticated } from "../src/server";
import { resolveConfig } from "../src/server/config";
import { RETURN_TO_HEADER } from "../src/server/return-to";
import { createSessionCookie } from "../src/server/session-cookie";
import { clock, session, testConfig } from "./support/fixtures";

vi.mock("openid-client", () => import("./support/openid-client"));

const request = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  headers: new Headers(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = request.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
    getAll: () =>
      [...request.cookies].map(([name, value]) => ({ name, value })),
  }),
  headers: async () => request.headers,
}));

class Redirect extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));

const signInWith = async (stored = session()) => {
  const writes = await createSessionCookie(resolveConfig(testConfig())).writes(
    { get: () => undefined, getAll: () => [] },
    stored
  );
  for (const write of writes) request.cookies.set(write.name, write.value);
};

const redirectOf = async (pending: Promise<unknown>) => {
  try {
    await pending;
  } catch (error) {
    if (error instanceof Redirect) return error.url;
    throw error;
  }
  return null;
};

beforeEach(() => {
  request.cookies.clear();
  request.headers = new Headers();
});

describe("auth() and getAccessToken()", () => {
  it("read a visitor as null", async () => {
    const auth = createAuth(testConfig());
    await expect(auth.auth()).resolves.toBeNull();
    await expect(auth.getAccessToken()).resolves.toBeUndefined();
  });

  it("read the session, and the token only through getAccessToken()", async () => {
    await signInWith();
    const auth = createAuth(testConfig());
    const read = await auth.auth();
    expect(read).toEqual({
      user: { sub: "user-1", name: "Ayşe Yılmaz", email: "ayse@example.org" },
      expiresAt: clock.now + 4 * 60_000,
    });
    expect(JSON.stringify(read)).not.toContain("access-1");
    await expect(auth.getAccessToken()).resolves.toBe("access-1");
  });

  it("agree that a session with no usable token is no session (A16, MDRS-216)", async () => {
    await signInWith(session({ accessTokenExpiresAt: clock.now + 1_000 }));
    const auth = createAuth(testConfig());
    await expect(auth.auth()).resolves.toBeNull();
    await expect(auth.getAccessToken()).resolves.toBeUndefined();
  });
});

describe("requireSession() and requireAccessToken()", () => {
  it("hand back the session and the token when there is one", async () => {
    await signInWith();
    const auth = createAuth(testConfig());
    await expect(auth.requireSession()).resolves.toMatchObject({
      user: { sub: "user-1" },
    });
    await expect(auth.requireAccessToken()).resolves.toBe("access-1");
  });

  it("send a visitor to sign-in with the page they asked for", async () => {
    const auth = createAuth(testConfig());
    await expect(
      redirectOf(auth.requireSession({ callbackUrl: "/ders/42?tab=talebeler" }))
    ).resolves.toBe("/auth/signin?callbackUrl=%2Fders%2F42%3Ftab%3Dtalebeler");
  });

  it("keep the page the proxy passed on when the caller names none (D4)", async () => {
    request.headers.set(RETURN_TO_HEADER, "/medrese/7/arsiv");
    const auth = createAuth(testConfig());
    await expect(redirectOf(auth.requireAccessToken())).resolves.toBe(
      "/auth/signin?callbackUrl=%2Fmedrese%2F7%2Farsiv"
    );
  });

  it("drop a destination on another origin", async () => {
    const auth = createAuth(testConfig());
    await expect(
      redirectOf(auth.requireSession({ callbackUrl: "https://evil.example/" }))
    ).resolves.toBe("/auth/signin");
  });
});

describe("redirectToSignIn() and signInUrl()", () => {
  it("mark a token the API refused with reauth=1, keeping the page", async () => {
    await signInWith();
    request.headers.set(RETURN_TO_HEADER, "/ders/42?tab=celseler");
    const auth = createAuth(testConfig());
    await expect(
      redirectOf(auth.redirectToSignIn({ reauth: true }))
    ).resolves.toBe(
      "/auth/signin?callbackUrl=%2Fders%2F42%3Ftab%3Dcelseler&reauth=1"
    );
    expect(auth.signInUrl(null, { reauth: true })).toBe(
      "/auth/signin?reauth=1"
    );
  });

  it("refuse to redirect the sign-in page to itself, rather than nest it a level per hop", async () => {
    request.headers.set(RETURN_TO_HEADER, "/auth/signin?callbackUrl=%2Fhesap");
    const auth = createAuth(testConfig());
    await expect(auth.redirectToSignIn()).rejects.toThrow(/sign-in page/);
    await expect(
      auth.redirectToSignIn({ callbackUrl: "/hesap" })
    ).rejects.toThrow(/sign-in page/);
    await expect(auth.requireSession()).rejects.toThrow(/sign-in page/);
  });

  it("use the destination inside a return path that is the sign-in page, never nesting it", () => {
    const auth = createAuth(testConfig());
    expect(auth.signInUrl("/auth/signin?callbackUrl=%2Fcourses")).toBe(
      "/auth/signin?callbackUrl=%2Fcourses"
    );
    const twice = `/auth/signin?callbackUrl=${encodeURIComponent(
      "/auth/signin?callbackUrl=%2Fhesap"
    )}`;
    expect(auth.signInUrl(twice)).toBe("/auth/signin");
    expect(auth.signInUrl("/auth/signin")).toBe("/auth/signin");
  });
});

describe("withAccessToken()", () => {
  it("runs the call with the token", async () => {
    await signInWith();
    const auth = createAuth(testConfig());
    const call = vi.fn(async (token: string) => `called with ${token}`);
    await expect(auth.withAccessToken(call)).resolves.toBe(
      "called with access-1"
    );
  });

  it("answers unauthenticated without a token, and never calls the API", async () => {
    const auth = createAuth(testConfig());
    const call = vi.fn();
    const result = await auth.withAccessToken(call);
    expect(isUnauthenticated(result)).toBe(true);
    expect(result).toEqual({ kind: "unauthenticated" });
    expect(call).not.toHaveBeenCalled();
  });

  it("answers unauthenticated when the API refuses the token with a 401", async () => {
    await signInWith();
    const auth = createAuth(testConfig());
    // The generated tedrisat client's ResponseError shape.
    const refused = Object.assign(
      new Error("Response returned an error code"),
      {
        response: { status: 401 },
      }
    );
    // `reauth`: a token went out and was refused, so the client must not go
    // straight back with this session.
    await expect(
      auth.withAccessToken(() => Promise.reject(refused))
    ).resolves.toEqual({ kind: "unauthenticated", reauth: true });
  });

  it("lets every other failure through as it was", async () => {
    await signInWith();
    const auth = createAuth(testConfig());
    const forbidden = Object.assign(new Error("forbidden"), {
      response: { status: 403 },
    });
    await expect(
      auth.withAccessToken(() => Promise.reject(forbidden))
    ).rejects.toBe(forbidden);
  });
});
