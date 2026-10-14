// @vitest-environment happy-dom
import { createElement, isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  allTimeZones,
  OTHER_ZONE,
  TIME_ZONE_PRESETS,
  validateName,
  zoneChoice,
} from "~/features/account/profile-model";
import { cleanup, click, render, settle } from "./dom";

const mocks = vi.hoisted(() => ({
  updateName: vi.fn(),
  updateZone: vi.fn(),
  updateInvitations: vi.fn(),
  notify: vi.fn(),
  getMyProfile: vi.fn(),
}));

vi.mock("next-intl", async (orig) =>
  (await import("./intl-mock")).intlMock(await orig())
);
// The page's own reads and server translations, for the wiring case below.
vi.mock("next-intl/server", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getTranslations: async () => (key: string) => key,
}));
vi.mock("~/features/account/reads", () => ({
  getMyProfile: mocks.getMyProfile,
  getAccountRoles: async () => null,
}));
vi.mock("../features/account/reads", () => ({
  getMyProfile: mocks.getMyProfile,
  getAccountRoles: async () => null,
}));
vi.mock("~/features/account/profile-actions", () => ({
  updateMyName: mocks.updateName,
  updateMyTimeZone: mocks.updateZone,
  updateMyInvitationEmails: mocks.updateInvitations,
}));
// The component imports the action through a relative path; mock both spellings.
vi.mock("../features/account/profile-actions", () => ({
  updateMyName: mocks.updateName,
  updateMyTimeZone: mocks.updateZone,
  updateMyInvitationEmails: mocks.updateInvitations,
}));
vi.mock("@medaris/ui/mds/toast", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useToaster: () => ({ notify: mocks.notify, dismiss: () => {} }),
}));

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});
afterEach(cleanup);

const mount = async (over: Record<string, unknown> = {}) => {
  const { AccountSettings } = await import(
    "~/features/account/components/account-settings"
  );
  return render(
    createElement(AccountSettings, {
      givenName: "Zeynep Betül",
      familyName: "Karahanlı",
      email: "zeynep.karahanli@example.com",
      gender: "FEMALE",
      timeZone: "Europe/Istanbul",
      lessonInvitationEmails: true,
      ...over,
    })
  );
};

const input = (host: HTMLElement, name: string) =>
  host.querySelector(`input[name="${name}"]`) as HTMLInputElement;

const type = async (el: HTMLInputElement, value: string) => {
  const { act } = await import("react");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("profile model", () => {
  it("requires both names and trims before judging", () => {
    expect(validateName("Zeynep", "Karahanlı")).toEqual({});
    expect(validateName("  ", "Karahanlı")).toEqual({ givenName: "required" });
    expect(validateName("", "")).toEqual({
      givenName: "required",
      familyName: "required",
    });
  });

  it("lists the eight zones of the design, then 'Diğer…' for any other saved zone", () => {
    expect(TIME_ZONE_PRESETS.map((p) => p.zone)).toEqual([
      "Europe/Istanbul",
      "Europe/Berlin",
      "Europe/Amsterdam",
      "Europe/Brussels",
      "Europe/Paris",
      "Europe/Vienna",
      "Europe/London",
      "America/New_York",
    ]);
    expect(zoneChoice("Europe/Paris")).toBe("Europe/Paris");
    expect(zoneChoice("Asia/Tokyo")).toBe(OTHER_ZONE);
    expect(zoneChoice(null)).toBe("Europe/Istanbul");
    expect(allTimeZones()).toContain("Asia/Tokyo");
  });
});

describe("Hesap cards (design tedris/34)", () => {
  it("shows the names, a read-only e-mail, the language choice, the calendar link and the sign-out link", async () => {
    const host = await mount();
    expect(input(host, "givenName").value).toBe("Zeynep Betül");
    expect(input(host, "familyName").value).toBe("Karahanlı");
    const email = input(host, "email");
    expect(email.value).toBe("zeynep.karahanli@example.com");
    expect(email.readOnly).toBe(true);
    // MDRS-275: a language select on the page's locale, not a read-only field
    const language = host.querySelector('[aria-label="Dil"]');
    expect(language?.textContent).toContain("Türkçe");
    expect(host.querySelector('input[name="language"]')).toBeNull();
    const hrefs = [...host.querySelectorAll("a")].map((a) =>
      a.getAttribute("href")
    );
    expect(hrefs).toContain("/tr/account/calendar");
    expect(hrefs).toContain("/tr/auth/signout");
    // Hidden for now (MDRS-141): the card and its link are gone.
    expect(hrefs.filter((h) => h?.includes("public-profile"))).toEqual([]);
    expect(host.textContent).not.toContain("Herkese açık profil");
    expect(host.textContent).toContain("Takvim bağlantını yönet");
    expect(host.textContent).toContain("Çıkış yap");
  });

  it("does not call the API with a blank name and says what is missing (criterion 2)", async () => {
    const host = await mount();
    await type(input(host, "givenName"), "   ");
    await click(host.querySelector('button[type="submit"]') as HTMLElement);
    expect(mocks.updateName).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Adını yaz.");

    await type(input(host, "givenName"), "Zeynep");
    await type(input(host, "familyName"), "");
    await click(host.querySelector('button[type="submit"]') as HTMLElement);
    expect(mocks.updateName).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Soyadını yaz.");
  });

  it("saves the trimmed names and confirms with a toast", async () => {
    mocks.updateName.mockResolvedValue({
      success: true,
      data: { givenName: "Zeynep", familyName: "Karahanlı" },
    });
    const host = await mount();
    await type(input(host, "givenName"), "  Zeynep ");
    await click(host.querySelector('button[type="submit"]') as HTMLElement);
    await settle();
    expect(mocks.updateName).toHaveBeenCalledWith("Zeynep", "Karahanlı");
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "success" })
    );
  });

  it("shows a refusal as an error toast with a Turkish line, not the API's raw text", async () => {
    mocks.updateName.mockResolvedValue({ success: false, error: "no" });
    const host = await mount();
    await click(host.querySelector('button[type="submit"]') as HTMLElement);
    await settle();
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: "error",
        description: "Sunucu isteği tamamlayamadı.",
      })
    );
  });

  it("opens the full zone list for a saved zone outside the presets", async () => {
    const host = await mount({ timeZone: "Asia/Tokyo" });
    expect(host.textContent).toContain("Diğer saat dilimi");
  });
});

describe("Lesson invitations by e-mail (MDRS-121, B13)", () => {
  const invitationSwitch = (host: HTMLElement) =>
    host.querySelector('[role="switch"]') as HTMLElement;
  /** What a person presses: the switch's label text. */
  const flip = (host: HTMLElement) =>
    click(
      invitationSwitch(host)
        .closest(".mds-choice")
        ?.querySelector(".mds-choice__label") as Element
    );

  it("shows the switch in the calendar card, as saved", async () => {
    const on = await mount();
    expect(on.textContent).toContain("Ders davetlerini e-postayla gönder");
    expect(invitationSwitch(on).getAttribute("aria-checked")).toBe("true");
    await cleanup();
    const off = await mount({ lessonInvitationEmails: false });
    expect(invitationSwitch(off).getAttribute("aria-checked")).toBe("false");
  });

  it("saves the opt-out the moment it is flipped, and confirms it", async () => {
    mocks.updateInvitations.mockResolvedValue({
      success: true,
      data: { lessonInvitationEmails: false },
    });
    const host = await mount();
    await flip(host);
    await settle();
    expect(mocks.updateInvitations).toHaveBeenCalledWith(false);
    expect(invitationSwitch(host).getAttribute("aria-checked")).toBe("false");
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: "success",
        title: "Ders davetleri kapatıldı; artık davet e-postası gelmeyecek.",
      })
    );
  });

  it("puts the switch back and says so when the save fails", async () => {
    mocks.updateInvitations.mockResolvedValue({ success: false, error: "no" });
    const host = await mount();
    await flip(host);
    await settle();
    expect(invitationSwitch(host).getAttribute("aria-checked")).toBe("true");
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "error" })
    );
  });
});

/**
 * #317: Keycloak holds the gender and tedrisat mirrors it into `GET /me`;
 * Hesap shows it read-only, the only place in tedris that does while the
 * public profile is hidden (MDRS-141).
 */
describe("The account's gender on Hesap", () => {
  const PROFILE_FORM =
    "/api/auth/signin?action=UPDATE_PROFILE&callbackUrl=%2Ftr%2Faccount&locale=tr";
  const row = (host: HTMLElement) =>
    host.querySelector('[data-testid="account-gender"]') as HTMLElement;
  const link = (host: HTMLElement) =>
    row(host).querySelector("a") as HTMLAnchorElement;

  it("shows each gender read-only in the personal card, with 'Değiştir'", async () => {
    const woman = await mount({ gender: "FEMALE" });
    const personal = input(woman, "email").closest("form") as HTMLElement;
    expect(personal.contains(row(woman))).toBe(true);
    expect(row(woman).textContent).toContain("Cinsiyet");
    expect(input(woman, "gender").value).toBe("Kadın");
    expect(input(woman, "gender").readOnly).toBe(true);
    expect(row(woman).textContent).toContain("Salt okunur.");
    expect(link(woman).textContent).toBe("Değiştir");
    await cleanup();

    const man = await mount({ gender: "MALE" });
    expect(input(man, "gender").value).toBe("Erkek");
    expect(link(man).textContent).toBe("Değiştir");
  });

  it("says 'Belirtilmemiş' with 'Ekle' when no gender is known", async () => {
    const host = await mount({ gender: null });
    expect(input(host, "gender").value).toBe("Belirtilmemiş");
    expect(input(host, "gender").readOnly).toBe(true);
    expect(link(host).textContent).toBe("Ekle");
    expect(row(host).textContent).not.toContain("Değiştir");
  });

  it("opens the account's profile form (UPDATE_PROFILE) and comes back to Hesap", async () => {
    const known = await mount({ gender: "MALE" });
    expect(link(known).getAttribute("href")).toBe(PROFILE_FORM);
    await cleanup();

    const unknown = await mount({ gender: null });
    expect(link(unknown).getAttribute("href")).toBe(PROFILE_FORM);
  });
});

describe("Hesap page wiring", () => {
  /** The first element of `type` in a server component's tree. */
  const find = (node: unknown, type: unknown): ReactElement | null => {
    if (Array.isArray(node)) {
      for (const child of node) {
        const hit = find(child, type);
        if (hit) return hit;
      }
      return null;
    }
    if (!isValidElement(node)) return null;
    if (node.type === type) return node;
    return find((node.props as { children?: unknown }).children, type);
  };

  it("hands the cards the gender GET /me carries", async () => {
    mocks.getMyProfile.mockResolvedValue({
      id: "u1",
      emailVerified: true,
      givenName: "Ömer",
      familyName: "Faruk",
      email: "omer@example.com",
      gender: "MALE",
      lessonInvitationEmails: true,
    });
    const { default: Page } = await import("../app/[locale]/account/page");
    const { AccountSettings } = await import(
      "~/features/account/components/account-settings"
    );

    const settings = find(await Page(), AccountSettings);

    expect(settings?.props).toMatchObject({ gender: "MALE" });
  });

  it("passes null when GET /me carries no gender", async () => {
    mocks.getMyProfile.mockResolvedValue({
      id: "u2",
      emailVerified: true,
      lessonInvitationEmails: true,
    });
    const { default: Page } = await import("../app/[locale]/account/page");
    const { AccountSettings } = await import(
      "~/features/account/components/account-settings"
    );

    const settings = find(await Page(), AccountSettings);

    expect(settings?.props).toMatchObject({ gender: null });
  });
});
