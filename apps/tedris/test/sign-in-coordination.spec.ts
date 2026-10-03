import type {
  KeycloakEntryDeps,
  SessionLike,
  StorageLike,
} from "@medaris/services/auth-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The fix for the "Giriş yapılamadı" box a signed-in visitor met on an
 * ordinary navigation: two tabs signing in at once overwrite NextAuth's one
 * state cookie, and the loser's callback fails with `OAuthCallback`
 * (`state mismatch`). See `sign-in-coordination.ts`.
 *
 * The module keeps "this page already started a round trip" in a module
 * variable, so every test loads a fresh copy.
 */
const load = async () => {
  vi.resetModules();
  return import("@medaris/services/auth-client");
};

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const throwingStorage: StorageLike = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
};

const request = {
  intent: "signin" as const,
  callbackUrl: "/tr/courses/c1/lessons/l1",
  locale: "tr",
};

const signedIn: SessionLike = { user: { name: "Enes" } };
const refreshFailed: SessionLike = {
  user: { name: "Enes" },
  error: "RefreshAccessTokenError",
};

/** One tab: its own `sessionStorage`, the origin's shared `localStorage`, a fake clock. */
const tab = (
  shared: StorageLike,
  overrides: Partial<KeycloakEntryDeps> = {}
): KeycloakEntryDeps & {
  signIn: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
} => {
  let now = 1_000_000;
  return {
    getSession: vi.fn(async () => null),
    signIn: vi.fn(),
    navigate: vi.fn(),
    isVisible: () => true,
    shared,
    local: new MemoryStorage(),
    now: () => now,
    sleep: async (ms) => {
      now += ms;
      await Promise.resolve();
    },
    ...overrides,
  } as never;
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("isRetryableAuthError", () => {
  it("retries the failed round trips, never AccessDenied or Configuration", async () => {
    const { isRetryableAuthError } = await load();
    for (const code of [
      "OAuthCallback",
      "OAuthSignin",
      "Callback",
      "Default",
    ]) {
      expect(isRetryableAuthError(code)).toBe(true);
    }
    for (const code of ["AccessDenied", "Configuration", "", null, undefined]) {
      expect(isRetryableAuthError(code)).toBe(false);
    }
  });
});

describe("enterKeycloak", () => {
  it("shows the box at once for a permanent error, without asking for the session", async () => {
    const { enterKeycloak } = await load();
    const deps = tab(new MemoryStorage());
    expect(await enterKeycloak(request, "AccessDenied", deps)).toBe(
      "show-error"
    );
    expect(deps.getSession).not.toHaveBeenCalled();
    expect(deps.signIn).not.toHaveBeenCalled();
  });

  it("goes straight on to the page when another tab already brought the session back", async () => {
    const { enterKeycloak } = await load();
    const deps = tab(new MemoryStorage(), {
      getSession: vi.fn(async () => signedIn),
    });
    expect(await enterKeycloak(request, "OAuthCallback", deps)).toBe(
      "redirected"
    );
    expect(deps.navigate).toHaveBeenCalledWith(request.callbackUrl);
    expect(deps.signIn).not.toHaveBeenCalled();
  });

  it("does not count a session whose refresh failed as signed in", async () => {
    const { enterKeycloak } = await load();
    const deps = tab(new MemoryStorage(), {
      getSession: vi.fn(async () => refreshFailed),
    });
    expect(await enterKeycloak(request, null, deps)).toBe("signing-in");
    expect(deps.signIn).toHaveBeenCalledWith(request);
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it("retries a transient failure once, silently, then shows the box", async () => {
    const { enterKeycloak } = await load();
    const shared = new MemoryStorage();
    const local = new MemoryStorage();

    const first = tab(shared, { local });
    expect(await enterKeycloak(request, "OAuthCallback", first)).toBe(
      "signing-in"
    );
    expect(first.signIn).toHaveBeenCalledTimes(1);

    // The page after the retry's failed callback: same tab, fresh module.
    const { enterKeycloak: again } = await load();
    const second = tab(shared, { local });
    expect(await again(request, "OAuthCallback", second)).toBe("show-error");
    expect(second.signIn).not.toHaveBeenCalled();
  });

  it("shows the box rather than retrying when sessionStorage cannot be read", async () => {
    const { enterKeycloak } = await load();
    const deps = tab(new MemoryStorage(), { local: throwingStorage });
    expect(await enterKeycloak(request, "OAuthCallback", deps)).toBe(
      "show-error"
    );
    expect(deps.signIn).not.toHaveBeenCalled();
  });

  it("still signs in without any storage when nothing went wrong", async () => {
    const { enterKeycloak } = await load();
    const deps = tab(throwingStorage, { local: throwingStorage });
    expect(await enterKeycloak(request, null, deps)).toBe("signing-in");
    expect(deps.signIn).toHaveBeenCalledTimes(1);
  });

  it("waits while another tab is at Keycloak, then follows the session it brings back", async () => {
    const { enterKeycloak, claimSignIn } = await load();
    const shared = new MemoryStorage();
    claimSignIn({ shared, tab: "other-tab", now: 1_000_000 });

    let calls = 0;
    const deps = tab(shared, {
      getSession: vi.fn(async () => (++calls >= 3 ? signedIn : null)),
    });
    expect(await enterKeycloak(request, null, deps)).toBe("redirected");
    expect(deps.signIn).not.toHaveBeenCalled();
    expect(deps.navigate).toHaveBeenCalledWith(request.callbackUrl);
  });

  it("takes over a claim its tab abandoned (closed on Keycloak's form)", async () => {
    const { enterKeycloak, claimSignIn, SIGN_IN_CLAIM_TTL_MS } = await load();
    const shared = new MemoryStorage();
    claimSignIn({
      shared,
      tab: "other-tab",
      now: 1_000_000 - SIGN_IN_CLAIM_TTL_MS,
    });
    const deps = tab(shared);
    expect(await enterKeycloak(request, null, deps)).toBe("signing-in");
    expect(deps.signIn).toHaveBeenCalledTimes(1);
  });

  it("never starts a round trip from a hidden tab", async () => {
    const { enterKeycloak } = await load();
    let calls = 0;
    const deps = tab(new MemoryStorage(), {
      isVisible: () => false,
      getSession: vi.fn(async () => (++calls >= 5 ? signedIn : null)),
    });
    expect(await enterKeycloak(request, null, deps)).toBe("redirected");
    expect(deps.signIn).not.toHaveBeenCalled();
  });

  it("stops waiting once cancelled", async () => {
    const { enterKeycloak, claimSignIn } = await load();
    const shared = new MemoryStorage();
    claimSignIn({ shared, tab: "other-tab", now: 1_000_000 });
    let cancelled = false;
    const deps = tab(shared, {
      getSession: vi.fn(async () => {
        cancelled = true;
        return null;
      }),
      cancelled: () => cancelled,
    });
    expect(await enterKeycloak(request, null, deps)).toBe("cancelled");
    expect(deps.signIn).not.toHaveBeenCalled();
  });

  it("the measured race: three tabs whose refresh failed together start ONE round trip", async () => {
    // Three pages: three copies of the module, one shared localStorage.
    const pages = [await load(), await load(), await load()];
    const shared = new MemoryStorage();
    let session: SessionLike = refreshFailed;
    const tabs = [0, 1, 2].map(() =>
      tab(shared, { getSession: vi.fn(async () => session) })
    );
    // Whichever tab wins brings the session back; the others then follow it.
    for (const t of tabs) {
      t.signIn.mockImplementation(() => {
        session = signedIn;
      });
    }

    const outcomes = await Promise.all(
      tabs.map((t, i) =>
        pages[i].enterKeycloak({ ...request, callbackUrl: "/tr/home" }, null, t)
      )
    );

    expect(tabs.reduce((n, t) => n + t.signIn.mock.calls.length, 0)).toBe(1);
    expect(outcomes.filter((o) => o === "signing-in")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "redirected")).toHaveLength(2);
  });

  it("starts one round trip per page even when two callers ask for it", async () => {
    const { enterKeycloak } = await load();
    const shared = new MemoryStorage();
    const local = new MemoryStorage();
    const signIn = vi.fn();
    const a = tab(shared, { local, signIn });
    const b = tab(shared, { local, signIn });
    await enterKeycloak(request, null, a);
    expect(await enterKeycloak(request, null, b)).toBe("signing-in");
    expect(signIn).toHaveBeenCalledTimes(1);
  });
});

describe("startKeycloakSignIn", () => {
  it("takes the claim from a waiting tab: the click is the visitor's decision", async () => {
    const { startKeycloakSignIn, claimSignIn, holdsSignIn, tabIdOf } =
      await load();
    const shared = new MemoryStorage();
    const local = new MemoryStorage();
    claimSignIn({ shared, tab: "other-tab", now: 1_000_000 });
    const signIn = vi.fn();

    startKeycloakSignIn(request, {
      signIn,
      shared,
      local,
      now: () => 1_000_001,
    });

    expect(signIn).toHaveBeenCalledWith(request);
    expect(holdsSignIn(shared, tabIdOf(local))).toBe(true);
  });
});
