import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A visitor starts at Keşfet (MDRS-256): Ana sayfa is personal, so `/` and
 * `/home` send someone who is not signed in to `/discover`, and a signed-in
 * caller keeps `/home`. `redirect` throws in Next, so the tests catch what it
 * was asked for.
 */
const state = vi.hoisted(() => ({ signedIn: false }));
vi.mock("~/features/courses/public-reads", () => ({
  isSignedIn: async () => state.signedIn,
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
// Ana sayfa's own reads and sections: only the visitor branch runs here, and the
// signed-in branch is asserted to get past the redirect.
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("~/features/home/components/home-sections", () => ({
  ContinueSection: () => null,
  DecksSection: () => null,
  FollowedSection: () => null,
  SectionSkeleton: () => null,
}));
vi.mock("~/features/schedule/components/home-sessions", () => ({
  HomeSessions: () => null,
}));
vi.mock("~/features/schedule/reads", () => ({
  getMyUpcomingLessons: async () => [],
}));
vi.mock("~/lib/auth_options", () => ({
  auth: async () => ({ user: { name: "Ayşe" } }),
}));

const params = Promise.resolve({ locale: "tr" });
const redirectedTo = async (page: () => Promise<unknown>) => {
  try {
    await page();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return null;
};

describe("where a visitor and a signed-in caller start", () => {
  beforeEach(() => {
    state.signedIn = false;
  });

  it("sends a visitor from / to Keşfet, in their locale", async () => {
    const { default: Root } = await import("../app/[locale]/page");
    expect(await redirectedTo(() => Root({ params }))).toBe(
      "REDIRECT /tr/discover"
    );
  });

  it("sends a visitor from /home to Keşfet instead of drawing an empty page", async () => {
    const { default: Home } = await import("../app/[locale]/home/page");
    expect(await redirectedTo(() => Home({ params }))).toBe(
      "REDIRECT /tr/discover"
    );
  });

  it("keeps a signed-in caller on Ana sayfa", async () => {
    state.signedIn = true;
    const { default: Root } = await import("../app/[locale]/page");
    expect(await redirectedTo(() => Root({ params }))).toBe(
      "REDIRECT /tr/home"
    );
    const { default: Home } = await import("../app/[locale]/home/page");
    expect(await redirectedTo(() => Home({ params }))).toBeNull();
  });
});
