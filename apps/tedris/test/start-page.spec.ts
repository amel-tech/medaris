import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
const enrolled: unknown[] = [];
let currentSub = "user-a";

/** An unsigned JWT carrying only `sub` — all `subjectOf` reads. */
const tokenFor = (sub: string) =>
  `x.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.y`;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name) } : undefined,
    set: (name: string, value: string) => jar.set(name, value),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("~/features/courses/actions", () => ({
  getMyCourses: async () => enrolled,
}));
vi.mock("~/lib/auth_options", () => ({
  getAccessToken: async () => tokenFor(currentSub),
}));

const redirectOf = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return (error as { url?: string }).url;
  }
  throw new Error("expected a redirect");
};

describe("/start and B1's button (MDRS-101)", () => {
  beforeEach(() => {
    jar.clear();
    enrolled.length = 0;
    currentSub = "user-a";
  });

  it("a brand-new user's first sign-in lands on B1, the next on /learning", async () => {
    const { default: StartPage } = await import("../app/[locale]/start/page");
    const { completeWelcome } = await import("~/features/welcome/actions");
    const start = () =>
      StartPage({ params: Promise.resolve({ locale: "tr" }) });

    expect(await redirectOf(start)).toBe("/tr/welcome");

    // Leaving B1 remembers the visit and opens /learning...
    expect(await redirectOf(() => completeWelcome("tr"))).toBe("/tr/learning");
    // ...so the next sign-in goes there directly.
    expect(await redirectOf(start)).toBe("/tr/learning");
  });

  it("a second new account on the same browser still gets B1", async () => {
    const { default: StartPage } = await import("../app/[locale]/start/page");
    const { completeWelcome } = await import("~/features/welcome/actions");
    const start = () =>
      StartPage({ params: Promise.resolve({ locale: "tr" }) });

    await redirectOf(() => completeWelcome("tr"));
    currentSub = "user-b";
    expect(await redirectOf(start)).toBe("/tr/welcome");

    await redirectOf(() => completeWelcome("tr"));
    currentSub = "user-a";
    expect(await redirectOf(start)).toBe("/tr/learning");
  });

  it("skips B1 for a user who is already enrolled", async () => {
    const { default: StartPage } = await import("../app/[locale]/start/page");
    enrolled.push({ id: "c1" });

    expect(
      await redirectOf(() =>
        StartPage({ params: Promise.resolve({ locale: "ar" }) })
      )
    ).toBe("/ar/learning");
  });

  it("B1's button refuses an unknown locale rather than echoing it", async () => {
    const { completeWelcome } = await import("~/features/welcome/actions");

    expect(await redirectOf(() => completeWelcome("//evil.example"))).toBe(
      "/en/learning"
    );
  });
});
