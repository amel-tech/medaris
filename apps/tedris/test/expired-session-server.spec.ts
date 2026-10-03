import { REFRESH_ACCESS_TOKEN_ERROR } from "@medaris/services/auth";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * MDRS-216, the server half: `auth()` is how the root layout, the legacy
 * header and the phone chrome ask "is someone signed in?". A session whose
 * refresh failed carries no usable token — every API call goes out anonymous —
 * so it must read as signed out, or a public page draws a member's chrome (and
 * the legacy "Talebe" label) around a visitor's data. The client half is
 * `expired-session.spec.ts`.
 */

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(async (): Promise<unknown> => null),
}));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-auth")>()),
  getServerSession: mocks.getServerSession,
}));

const refreshFailed = {
  user: { name: "E2E Sistem Admin" },
  expires: "2099-01-01",
  error: REFRESH_ACCESS_TOKEN_ERROR,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("an expired session cookie", () => {
  it("is a RefreshAccessTokenError — the refresh token is past its deadline, Keycloak is never asked", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { default: authOptions } = await import("~/lib/auth_options");
    const token = await authOptions.callbacks?.jwt?.({
      token: {
        accessToken: "a",
        accessTokenExpired: Date.now() - 60_000,
        refreshToken: "r",
        refreshTokenExpireIn: Date.now() - 1000,
      },
    } as never);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(token?.error).toBe(REFRESH_ACCESS_TOKEN_ERROR);
    const session = await authOptions.callbacks?.session?.({
      session: { user: { name: "E2E Sistem Admin" }, expires: "2099-01-01" },
      token,
    } as never);
    // The client-visible session keeps the flag: `RefreshErrorRedirect` reads it.
    expect(session).toMatchObject({ error: REFRESH_ACCESS_TOKEN_ERROR });
    vi.restoreAllMocks();
  });
});

describe("a failed refresh on the server (auth())", () => {
  it("reads as signed out, so the layout and chrome render the visitor's view", async () => {
    mocks.getServerSession.mockResolvedValue(refreshFailed);
    const { auth } = await import("~/lib/auth_options");
    expect(await auth()).toBeNull();
  });

  it("control: a healthy session is returned as it is", async () => {
    const healthy = { ...refreshFailed, error: undefined };
    mocks.getServerSession.mockResolvedValue(healthy);
    const { auth } = await import("~/lib/auth_options");
    expect(await auth()).toEqual(healthy);
  });

  it("control: no session stays no session", async () => {
    mocks.getServerSession.mockResolvedValue(null);
    const { auth } = await import("~/lib/auth_options");
    expect(await auth()).toBeNull();
  });
});
