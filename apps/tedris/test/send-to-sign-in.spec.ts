// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedActionResult } from "~/lib/authenticated-action";

/**
 * The client half of the one "unauthenticated" path (E2): a Server Action
 * answered `{ kind: "unauthenticated" }`, and the page sends the talebe to
 * sign in, in the page's language, and back to exactly where they were,
 * instead of drawing "could not be saved".
 */

const assign = vi.fn();

const at = (pathname: string, search = "", hash = "") =>
  vi.spyOn(window, "location", "get").mockReturnValue({
    ...window.location,
    pathname,
    search,
    hash,
    assign,
  });

const signedOut: AuthenticatedActionResult<never> = {
  kind: "unauthenticated",
  success: false,
  error: "Unauthenticated",
  status: 401,
};

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  // the page's language, which the root layout writes on <html> (MDRS-248)
  document.documentElement.lang = "en";
});

afterEach(() => {
  vi.restoreAllMocks();
  assign.mockReset();
});

describe("sendToSignIn", () => {
  it("sends the talebe to sign in and back to the same path, query and fragment", async () => {
    at("/courses/c1", "?tab=sorularim", "#q1");
    const { sendToSignIn } = await import("~/lib/send-to-sign-in");
    expect(sendToSignIn(signedOut)).toBe(true);
    expect(assign).toHaveBeenCalledWith(
      `/api/auth/signin?callbackUrl=${encodeURIComponent("/courses/c1?tab=sorularim#q1")}&locale=en`
    );
  });

  it("asks Keycloak for new tokens when tedrisat refused the one the session holds (reauth)", async () => {
    at("/courses/c1");
    const { sendToSignIn } = await import("~/lib/send-to-sign-in");
    expect(sendToSignIn({ ...signedOut, reauth: true })).toBe(true);
    expect(assign).toHaveBeenCalledWith(
      `/api/auth/signin?callbackUrl=${encodeURIComponent("/courses/c1")}&locale=en&reauth=1`
    );
  });

  it("falls back to Turkish when the page names no language it knows", async () => {
    document.documentElement.lang = "";
    at("/api/decks/d1/export");
    const { sendToSignIn } = await import("~/lib/send-to-sign-in");
    sendToSignIn(signedOut);
    expect(assign).toHaveBeenCalledWith(
      `/api/auth/signin?callbackUrl=${encodeURIComponent("/api/decks/d1/export")}&locale=tr`
    );
  });

  it("lets every other answer through, a failure included", async () => {
    at("/decks");
    const { sendToSignIn } = await import("~/lib/send-to-sign-in");
    expect(sendToSignIn({ success: true, data: 1 })).toBe(false);
    expect(sendToSignIn({ success: false, error: "x", status: 403 })).toBe(
      false
    );
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("the deck screens' `attempt`", () => {
  it("stays busy while the browser leaves for sign-in, instead of a failure toast", async () => {
    document.documentElement.lang = "tr";
    at("/decks/d1");
    const { attempt } = await import("~/features/flashcards/attempt");
    const settled = vi.fn();
    void attempt(async () => signedOut).then(settled);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith(
      `/api/auth/signin?callbackUrl=${encodeURIComponent("/decks/d1")}&locale=tr`
    );
  });

  it("still answers a refusal and a dropped request as failures", async () => {
    at("/decks/d1");
    const { attempt } = await import("~/features/flashcards/attempt");
    expect(
      await attempt(async () => ({ success: false, error: "no", status: 403 }))
    ).toEqual({ success: false, error: "no", status: 403 });
    expect(
      await attempt(async () => {
        throw new Error("Failed to fetch");
      })
    ).toEqual({ success: false, error: "Failed to fetch" });
    expect(assign).not.toHaveBeenCalled();
  });
});
