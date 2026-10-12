import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredSession } from "./sealed-session";

/**
 * The server's tedrisat client: with the caller's token, or, when the session
 * is over and there is none, the way to sign-in instead of a call that can
 * only answer 401 (#270, A16), keeping the page the person was on (D4). The
 * session is a real sealed cookie read by the real `~/lib/auth`; the return
 * path is the header the proxy hands the render.
 */
const REDIRECT = "NEXT_REDIRECT";
let session: Partial<StoredSession> | null = null;
let returnTo: string | null = null;
const created = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`${REDIRECT}:${to}`);
  },
}));
vi.mock("next/headers", async () =>
  (await import("./sealed-session")).nextHeaders(
    () => session,
    () => returnTo
  )
);
vi.mock("@medaris/services/tedrisat", () => ({
  createServerTedrisatAPIs: (accessToken: string, baseUrl: string) => {
    created(accessToken, baseUrl);
    return { accessToken };
  },
}));

beforeEach(() => {
  session = null;
  returnTo = null;
  created.mockReset();
});

const client = async () => (await import("~/lib/tedrisat-api")).tedrisatApi();

describe("tedrisatApi", () => {
  it("makes the client with the caller's token", async () => {
    session = { accessToken: "access-token" };
    expect(await client()).toEqual({ accessToken: "access-token" });
    expect(created).toHaveBeenCalledExactlyOnceWith(
      "access-token",
      "http://127.0.0.1:1"
    );
  });

  it("sends a caller with no token to the sign-in page, back to the page afterwards, and makes no client", async () => {
    returnTo = "/ders/c-1/celseler?hafta=3";
    await expect(client()).rejects.toThrow(
      `${REDIRECT}:/auth/signin?callbackUrl=%2Fders%2Fc-1%2Fcelseler%3Fhafta%3D3`
    );
    expect(created).not.toHaveBeenCalled();
  });

  it("treats a token that has run out as none, as `auth()` does", async () => {
    session = {
      accessToken: "access-token",
      accessTokenExpiresAt: Date.now() - 1_000,
    };
    await expect(client()).rejects.toThrow(`${REDIRECT}:/auth/signin`);
    expect(created).not.toHaveBeenCalled();
  });
});
