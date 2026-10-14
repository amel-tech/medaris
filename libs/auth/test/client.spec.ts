import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGE_KEYS,
  accountActionHref,
  authErrorMessageKey,
  enterSignIn,
  handleUnauthenticated,
  isRetryableAuthError,
  type Session,
  type SignInDeps,
  sessionChange,
  signIn,
  signInHref,
  signOut,
} from "../src/client";
import {
  AUTO_START_KEY,
  AUTO_WINDOW_MS,
  GO_ON_KEY,
  MAX_AUTO_STARTS,
  MAX_GO_ONS,
  resetSignInState,
  SIGN_IN_CLAIM_KEY,
  TAB_ID_KEY,
} from "../src/client/sign-in";

class MemoryStorage {
  readonly items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

const signedIn: Session = {
  user: { sub: "user-1", name: "Ayşe" },
  expiresAt: 0,
};

/** A browser tab with its own session storage, sharing `shared` with its siblings. */
const tab = (
  shared: MemoryStorage,
  overrides: Partial<SignInDeps> = {}
): SignInDeps & { visits: string[]; local: MemoryStorage } => {
  const visits: string[] = [];
  let time = 1_000_000;
  return {
    getSession: async () => null,
    navigate: (url) => visits.push(url),
    isVisible: () => true,
    shared,
    local: new MemoryStorage(),
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
    pollMs: 1000,
    ...overrides,
    visits,
  } as SignInDeps & { visits: string[]; local: MemoryStorage };
};

beforeEach(() => resetSignInState());

describe("signInHref", () => {
  it("names the start route with what the server needs", () => {
    expect(signInHref()).toBe("/api/auth/signin");
    expect(
      signInHref(
        { intent: "register", callbackUrl: "/tr/start?x=1", locale: "tr" },
        true
      )
    ).toBe(
      "/api/auth/signin?callbackUrl=%2Ftr%2Fstart%3Fx%3D1&locale=tr&intent=register&auto=1"
    );
    expect(signInHref({ callbackUrl: "/ders/42", reauth: true })).toBe(
      "/api/auth/signin?callbackUrl=%2Fders%2F42&reauth=1"
    );
  });
});

describe("accountActionHref", () => {
  it("names the start route with the action, the way back and the locale", () => {
    expect(accountActionHref("UPDATE_PROFILE")).toBe(
      "/api/auth/signin?action=UPDATE_PROFILE"
    );
    expect(
      accountActionHref("UPDATE_PROFILE", {
        callbackUrl: "/tr/account/public-profile",
        locale: "tr",
      })
    ).toBe(
      "/api/auth/signin?action=UPDATE_PROFILE&callbackUrl=%2Ftr%2Faccount%2Fpublic-profile&locale=tr"
    );
  });
});

describe("enterSignIn", () => {
  const request = { callbackUrl: "/ders/42", locale: "tr" };

  it("starts one round trip, marked automatic", async () => {
    const deps = tab(new MemoryStorage());
    await expect(enterSignIn(request, null, deps)).resolves.toEqual({
      kind: "signing-in",
    });
    expect(deps.visits).toEqual([
      "/api/auth/signin?callbackUrl=%2Fders%2F42&locale=tr&auto=1",
    ]);
  });

  it("goes straight on when the session is already there", async () => {
    const deps = tab(new MemoryStorage(), {
      getSession: async () => signedIn,
    });
    await expect(enterSignIn(request, "OAuthCallback", deps)).resolves.toEqual({
      kind: "redirected",
    });
    expect(deps.visits).toEqual(["/ders/42"]);
  });

  it("stops going straight on after a couple of times, and shows SignInLimit (a page that sends a signed-in browser back here)", async () => {
    const deps = tab(new MemoryStorage(), {
      getSession: async () => signedIn,
    });
    for (let index = 0; index < MAX_GO_ONS; index++) {
      resetSignInState();
      await expect(enterSignIn(request, null, deps)).resolves.toEqual({
        kind: "redirected",
      });
    }
    resetSignInState();
    await expect(enterSignIn(request, null, deps)).resolves.toEqual({
      kind: "show-error",
      error: "SignInLimit",
    });
    expect(deps.visits).toEqual(Array(MAX_GO_ONS).fill("/ders/42"));
    expect(JSON.parse(deps.local.getItem(GO_ON_KEY) as string)).toMatchObject({
      count: MAX_GO_ONS,
    });
  });

  it("goes on again once the window has passed", async () => {
    let time = 1_000_000;
    const deps = tab(new MemoryStorage(), {
      getSession: async () => signedIn,
      now: () => time,
    });
    for (let index = 0; index < MAX_GO_ONS; index++) {
      await enterSignIn(request, null, deps);
    }
    time += AUTO_WINDOW_MS;
    await expect(enterSignIn(request, null, deps)).resolves.toEqual({
      kind: "redirected",
    });
  });

  it("does not go on without sessionStorage, where nothing could count it", async () => {
    const deps = tab(new MemoryStorage(), {
      getSession: async () => signedIn,
      local: undefined,
    });
    await expect(enterSignIn(request, null, deps)).resolves.toEqual({
      kind: "show-error",
      error: "SignInLimit",
    });
    expect(deps.visits).toEqual([]);
  });

  it.each([
    "AccessDenied",
    "Configuration",
    "SignInLimit",
  ])("never retries %s by itself", async (error) => {
    const deps = tab(new MemoryStorage());
    await expect(enterSignIn(request, error, deps)).resolves.toEqual({
      kind: "show-error",
      error,
    });
    expect(deps.visits).toEqual([]);
    expect(isRetryableAuthError(error)).toBe(false);
  });

  it("retries a failed round trip once, then shows the box with its error", async () => {
    const deps = tab(new MemoryStorage());
    await expect(enterSignIn(request, "OAuthCallback", deps)).resolves.toEqual({
      kind: "signing-in",
    });
    resetSignInState(); // the page after the trip is a new page
    await expect(enterSignIn(request, "OAuthCallback", deps)).resolves.toEqual({
      kind: "show-error",
      error: "OAuthCallback",
    });
    expect(deps.visits).toHaveLength(1);
  });

  it("stops starting by itself after a few round trips, whatever the reason (loop cap), and says SignInLimit", async () => {
    const deps = tab(new MemoryStorage());
    for (let index = 0; index < MAX_AUTO_STARTS; index++) {
      resetSignInState();
      await expect(enterSignIn(request, null, deps)).resolves.toEqual({
        kind: "signing-in",
      });
    }
    resetSignInState();
    await expect(enterSignIn(request, null, deps)).resolves.toEqual({
      kind: "show-error",
      error: "SignInLimit",
    });
    expect(deps.visits).toHaveLength(MAX_AUTO_STARTS);
    expect(
      JSON.parse(deps.local.getItem(AUTO_START_KEY) as string)
    ).toMatchObject({ count: MAX_AUTO_STARTS });
  });

  it("waits while another tab is in a round trip, and goes on with the session it brings", async () => {
    const shared = new MemoryStorage();
    shared.setItem(
      SIGN_IN_CLAIM_KEY,
      JSON.stringify({ tab: "other-tab", at: 1_000_000 })
    );
    let reads = 0;
    const deps = tab(shared, {
      getSession: async () => (++reads >= 3 ? signedIn : null),
    });
    await expect(enterSignIn(request, null, deps)).resolves.toEqual({
      kind: "redirected",
    });
    expect(deps.visits).toEqual(["/ders/42"]);
  });

  it("takes over an abandoned claim", async () => {
    const shared = new MemoryStorage();
    shared.setItem(
      SIGN_IN_CLAIM_KEY,
      JSON.stringify({ tab: "closed-tab", at: 1_000_000 - 31_000 })
    );
    const deps = tab(shared);
    await expect(enterSignIn(request, null, deps)).resolves.toEqual({
      kind: "signing-in",
    });
    expect(JSON.parse(shared.getItem(SIGN_IN_CLAIM_KEY) as string).tab).toBe(
      deps.local.getItem(TAB_ID_KEY)
    );
  });

  it("does not start from a hidden tab", async () => {
    let reads = 0;
    const deps = tab(new MemoryStorage(), {
      isVisible: () => false,
      getSession: async () => (++reads >= 4 ? signedIn : null),
    });
    await expect(enterSignIn(request, null, deps)).resolves.toEqual({
      kind: "redirected",
    });
    expect(deps.visits).toEqual(["/ders/42"]);
  });
});

describe("enterSignIn with reauth (the API refused this session's token)", () => {
  const request = { callbackUrl: "/ders/42", locale: "tr", reauth: true };

  it("does not go back with the refused session: it fetches new tokens through the start route", async () => {
    const deps = tab(new MemoryStorage(), {
      getSession: async () => signedIn,
    });
    await expect(enterSignIn(request, null, deps)).resolves.toEqual({
      kind: "signing-in",
    });
    expect(deps.visits).toEqual([
      "/api/auth/signin?callbackUrl=%2Fders%2F42&locale=tr&reauth=1&auto=1",
    ]);
  });

  it("goes on once another tab has brought a newer session", async () => {
    const shared = new MemoryStorage();
    shared.setItem(
      SIGN_IN_CLAIM_KEY,
      JSON.stringify({ tab: "other-tab", at: 1_000_000 })
    );
    let reads = 0;
    const renewed: Session = { ...signedIn, expiresAt: 5 };
    const deps = tab(shared, {
      getSession: async () => (++reads >= 3 ? renewed : signedIn),
    });
    await expect(enterSignIn(request, null, deps)).resolves.toEqual({
      kind: "redirected",
    });
    expect(deps.visits).toEqual(["/ders/42"]);
  });

  it("ends on SignInLimit when new tokens keep being refused", async () => {
    const deps = tab(new MemoryStorage(), {
      getSession: async () => signedIn,
    });
    for (let index = 0; index < MAX_AUTO_STARTS; index++) {
      resetSignInState();
      await expect(enterSignIn(request, null, deps)).resolves.toEqual({
        kind: "signing-in",
      });
    }
    resetSignInState();
    await expect(enterSignIn(request, null, deps)).resolves.toEqual({
      kind: "show-error",
      error: "SignInLimit",
    });
    expect(deps.visits).toHaveLength(MAX_AUTO_STARTS);
  });
});

describe("authErrorMessageKey", () => {
  it("gives SignInLimit its own message, and keeps NextAuth's codes", () => {
    expect(authErrorMessageKey("SignInLimit")).toBe("signInLimit");
    expect(authErrorMessageKey("AccessDenied")).toBe("accessDenied");
    expect(authErrorMessageKey("Configuration")).toBe("configurationError");
    expect(authErrorMessageKey("OAuthCallback")).toBe("errorDescription");
    expect(authErrorMessageKey("SomethingNew")).toBe("errorDescription");
    expect(authErrorMessageKey(null)).toBe("errorDescription");
  });

  it("lists every key it can answer, for an app's message spec", () => {
    const answered = new Set(
      [...AUTH_ERROR_CODES, "Unknown", null].map(authErrorMessageKey)
    );
    expect([...answered].sort()).toEqual([...AUTH_ERROR_MESSAGE_KEYS].sort());
  });
});

describe("signIn", () => {
  it("takes the round trip on a click, whatever another tab holds", () => {
    const shared = new MemoryStorage();
    shared.setItem(
      SIGN_IN_CLAIM_KEY,
      JSON.stringify({ tab: "other-tab", at: 1_000_000 })
    );
    const deps = tab(shared);
    signIn(
      { intent: "register", callbackUrl: "/tr/start", locale: "tr" },
      deps
    );
    expect(deps.visits).toEqual([
      "/api/auth/signin?callbackUrl=%2Ftr%2Fstart&locale=tr&intent=register",
    ]);
    expect(
      JSON.parse(shared.getItem(SIGN_IN_CLAIM_KEY) as string).tab
    ).not.toBe("other-tab");
  });
});

describe("handleUnauthenticated", () => {
  it("sends the visitor to sign in and back to exactly where they were", () => {
    const deps = {
      ...tab(new MemoryStorage()),
      location: () => "/ders/42?tab=notlar#n3",
    };
    expect(
      handleUnauthenticated({ kind: "unauthenticated" }, { locale: "tr" }, deps)
    ).toBe(true);
    expect(deps.visits).toEqual([
      "/api/auth/signin?callbackUrl=%2Fders%2F42%3Ftab%3Dnotlar%23n3&locale=tr",
    ]);
  });

  it("asks for new tokens when the API refused the session's token (reauth)", () => {
    const deps = { ...tab(new MemoryStorage()), location: () => "/ders/42" };
    expect(
      handleUnauthenticated(
        { kind: "unauthenticated", reauth: true },
        { locale: "tr" },
        deps
      )
    ).toBe(true);
    expect(deps.visits).toEqual([
      "/api/auth/signin?callbackUrl=%2Fders%2F42&locale=tr&reauth=1",
    ]);
  });

  it("leaves every other result to the caller", () => {
    const deps = { ...tab(new MemoryStorage()), location: () => "/" };
    expect(
      handleUnauthenticated(
        { success: false, code: "AUTHZ_FORBIDDEN" },
        {},
        deps
      )
    ).toBe(false);
    expect(handleUnauthenticated(null, {}, deps)).toBe(false);
    expect(deps.visits).toEqual([]);
  });
});

describe("signOut", () => {
  it("posts to the sign-out route with the locale", () => {
    const submit = vi.fn();
    signOut({ locale: "en" }, { submit });
    expect(submit).toHaveBeenCalledWith("/api/auth/signout", { locale: "en" });
  });
});

describe("sessionChange", () => {
  const other: Session = { user: { sub: "user-2" }, expiresAt: 0 };
  it("names the change a page has to reload for", () => {
    expect(sessionChange(signedIn, null)).toBe("ended");
    expect(sessionChange(signedIn, other)).toBe("switched");
    expect(sessionChange(signedIn, { ...signedIn, expiresAt: 9 })).toBe("same");
    expect(sessionChange(null, signedIn)).toBe("started");
    expect(sessionChange(null, null)).toBe("same");
  });
});
