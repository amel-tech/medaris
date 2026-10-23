import { describe, expect, it, vi } from "vitest";

/**
 * `/start` and `/welcome` once made the first-login step (B1, MDRS-101); the
 * owner dropped it. Both addresses stay for old links and sign-in round trips
 * already under way, and send everyone to Ana sayfa (`/`), reading
 * nothing and setting no cookie.
 */
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));

const redirectOf = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return (error as { url?: string }).url;
  }
  throw new Error("expected a redirect");
};

describe("/start and /welcome after the welcome step (MDRS-101)", () => {
  it("/start sends to Ana sayfa", async () => {
    const { default: StartPage } = await import("../app/start/page");
    expect(await redirectOf(() => StartPage())).toBe("/");
  });

  it("/welcome sends to Ana sayfa too, instead of the old placeholder screen", async () => {
    const { default: WelcomePage } = await import("../app/welcome/page");
    expect(await redirectOf(() => WelcomePage())).toBe("/");
  });
});
