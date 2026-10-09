import { ResponseError } from "@medaris/services/tedrisat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `readOnce`: what a page makes of one read. The way to sign-in from
 * `tedrisatApi` passes through; a 403 is its own answer, a 404 the portal's,
 * anything else a logged failure.
 */
const REDIRECT = "NEXT_REDIRECT";
const NOT_FOUND = "NEXT_NOT_FOUND";
let sessionOver = false;

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error(NOT_FOUND);
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith(REDIRECT)) {
      throw error;
    }
  },
}));
vi.mock("~/lib/tedrisat-api", () => ({
  tedrisatApi: async () => {
    if (sessionOver) throw new Error(`${REDIRECT}:/auth/signin`);
    return {};
  },
}));

const status = (code: number) =>
  new ResponseError(new Response(null, { status: code }), `HTTP ${code}`);

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sessionOver = false;
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errors.mockRestore());

const read = async (call: () => Promise<unknown>) =>
  (await import("~/lib/tedrisat-read")).readOnce("the thing", call);

describe("readOnce", () => {
  it("is the data when the read answers", async () => {
    expect(await read(async () => 7)).toEqual({ status: "ok", data: 7 });
  });

  it("passes the way to sign-in on when the session is over, and logs nothing", async () => {
    sessionOver = true;
    await expect(read(async () => 7)).rejects.toThrow(
      `${REDIRECT}:/auth/signin`
    );
    expect(errors).not.toHaveBeenCalled();
  });

  it("is forbidden for a 403, the portal's 404 for a 404, and a logged failure otherwise", async () => {
    expect(await read(() => Promise.reject(status(403)))).toEqual({
      status: "forbidden",
    });
    await expect(read(() => Promise.reject(status(404)))).rejects.toThrow(
      NOT_FOUND
    );
    expect(errors).not.toHaveBeenCalled();
    expect(await read(() => Promise.reject(status(503)))).toEqual({
      status: "failed",
    });
    expect(errors).toHaveBeenCalledOnce();
  });
});
