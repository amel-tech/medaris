import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The server's tedrisat client: with the caller's token, or, when the session
 * is over and there is none, the way to sign-in instead of a call that can
 * only answer 401.
 */
const REDIRECT = "NEXT_REDIRECT";
let token: string | undefined;
const created = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`${REDIRECT}:${to}`);
  },
}));
vi.mock("~/env", () => ({
  env: { TEDRISAT_API_BASE_URL: "http://tedrisat.test" },
}));
vi.mock("~/lib/auth_options", () => ({ getAccessToken: async () => token }));
vi.mock("@medaris/services/tedrisat", () => ({
  createServerTedrisatAPIs: (accessToken: string, baseUrl: string) => {
    created(accessToken, baseUrl);
    return { accessToken };
  },
}));

beforeEach(() => {
  token = undefined;
  created.mockReset();
});

const client = async () => (await import("~/lib/tedrisat-api")).tedrisatApi();

describe("tedrisatApi", () => {
  it("makes the client with the caller's token", async () => {
    token = "access-token";
    expect(await client()).toEqual({ accessToken: "access-token" });
    expect(created).toHaveBeenCalledExactlyOnceWith(
      "access-token",
      "http://tedrisat.test"
    );
  });

  it("sends a caller with no token to the sign-in page, and makes no client", async () => {
    await expect(client()).rejects.toThrow(`${REDIRECT}:/auth/signin`);
    expect(created).not.toHaveBeenCalled();
  });
});
