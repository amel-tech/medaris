// @vitest-environment happy-dom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "./dom";

/**
 * MDRS-141: the owner hid the talebe's public profile. One constant,
 * `PUBLIC_PROFILE_ENABLED`, drives both places: the Hesap card and the page.
 * The last tests flip it to prove that is all turning the profile back on takes.
 */
const mocks = vi.hoisted(() => ({
  getMyPublicProfile: vi.fn(),
}));

vi.mock("next-intl", async (orig) =>
  (await import("./intl-mock")).intlMock(await orig())
);
vi.mock("next-intl/server", () => ({ getLocale: async () => "tr" }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("~/features/account/reads", () => ({
  getMyPublicProfile: mocks.getMyPublicProfile,
}));
vi.mock("~/features/account/profile-actions", () => ({
  updateMyName: vi.fn(),
  updateMyTimeZone: vi.fn(),
}));
vi.mock("../features/account/profile-actions", () => ({
  updateMyName: vi.fn(),
  updateMyTimeZone: vi.fn(),
}));
vi.mock("~/features/public-profile/actions", () => ({
  saveProfileTexts: vi.fn(),
  saveVisibility: vi.fn(),
}));
vi.mock("../features/public-profile/actions", () => ({
  saveProfileTexts: vi.fn(),
  saveVisibility: vi.fn(),
}));
vi.mock("~/lib/i18n/loose", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAccountTranslations: async () => (key: string) => key,
}));
vi.mock("@medaris/ui/mds/toast", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useToaster: () => ({ notify: vi.fn(), dismiss: () => {} }),
}));

beforeEach(() => {
  mocks.getMyPublicProfile.mockReset();
  vi.resetModules();
});
afterEach(() => {
  vi.doUnmock("~/features/public-profile/availability");
  return cleanup();
});

const page = async () =>
  (await import("../app/[locale]/account/public-profile/page")).default;

const hesap = async () => {
  const { AccountSettings } = await import(
    "~/features/account/components/account-settings"
  );
  return render(
    createElement(AccountSettings, {
      givenName: "Zeynep Betül",
      familyName: "Karahanlı",
      email: "zeynep.karahanli@example.com",
      timeZone: "Europe/Istanbul",
      lessonInvitationEmails: true,
    })
  );
};

const links = (host: HTMLElement) =>
  [...host.querySelectorAll("a")].map((a) => a.getAttribute("href"));

describe("the public profile is hidden (MDRS-141)", () => {
  it("ships switched off", async () => {
    const { PUBLIC_PROFILE_ENABLED } = await import(
      "~/features/public-profile/availability"
    );
    expect(PUBLIC_PROFILE_ENABLED).toBe(false);
  });

  it("answers /account/public-profile with a 404 before reading anything", async () => {
    const Page = await page();
    await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getMyPublicProfile).not.toHaveBeenCalled();
  });

  it("leaves the card and its link out of Hesap, and keeps the other cards", async () => {
    const host = await hesap();
    expect(links(host).filter((h) => h?.includes("public-profile"))).toEqual(
      []
    );
    expect(host.textContent).not.toContain("Herkese açık profil");
    expect(links(host)).toContain("/tr/account/calendar");
    expect(host.textContent).toContain("Kişisel bilgiler");
  });
});

describe("turning the public profile back on is the one constant (MDRS-141)", () => {
  beforeEach(() => {
    vi.doMock("~/features/public-profile/availability", () => ({
      PUBLIC_PROFILE_ENABLED: true,
    }));
  });

  it("gives the page back", async () => {
    mocks.getMyPublicProfile.mockResolvedValue(null);
    const Page = await page();
    await expect(Page()).resolves.toBeTruthy();
    expect(mocks.getMyPublicProfile).toHaveBeenCalledTimes(1);
  });

  it("gives the Hesap card and its link back", async () => {
    const host = await hesap();
    expect(links(host)).toContain("/tr/account/public-profile");
    expect(host.textContent).toContain("Herkese açık profil");
  });
});
