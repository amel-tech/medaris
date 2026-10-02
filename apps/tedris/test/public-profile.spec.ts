// @vitest-environment happy-dom
import type { MyPublicProfileResponse } from "@medaris/services/tedrisat";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hiddenFields,
  hiddenLine,
  isDirty,
  validateProfile,
} from "~/features/public-profile/model";
import { cleanup, click, render, settle } from "./dom";

const mocks = vi.hoisted(() => ({
  saveTexts: vi.fn(),
  saveVisibility: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("next-intl", async (orig) =>
  (await import("./intl-mock")).intlMock(await orig())
);
vi.mock("~/features/public-profile/actions", () => ({
  saveProfileTexts: mocks.saveTexts,
  saveVisibility: mocks.saveVisibility,
}));
// The component imports the action through a relative path; mock both spellings.
vi.mock("../features/public-profile/actions", () => ({
  saveProfileTexts: mocks.saveTexts,
  saveVisibility: mocks.saveVisibility,
}));
vi.mock("@medaris/ui/mds/toast", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useToaster: () => ({ notify: mocks.notify, dismiss: () => {} }),
}));

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});
afterEach(cleanup);

const profile = (
  over: Partial<MyPublicProfileResponse> = {}
): MyPublicProfileResponse => ({
  kunye: "Zeynep Betül Üsküdârî",
  gender: "FEMALE",
  city: "İstanbul",
  about: "Sarf ve nahiv okuyorum.",
  fullName: "Zeynep Betül Karahanlı",
  courses: ["Emsile ve Bina", "Siyer okumaları"],
  visibility: { fullName: false, city: false, about: true, courses: false },
  ...over,
});

const mount = async (p: MyPublicProfileResponse) => {
  const { PublicProfilePage } = await import(
    "~/features/public-profile/components/public-profile-page"
  );
  return render(createElement(PublicProfilePage, { profile: p }));
};

const switches = (host: HTMLElement) =>
  [...host.querySelectorAll('[role="switch"]')] as HTMLElement[];

/** What a person presses: the switch's label text (the kit's own spec does the same). */
const flip = (host: HTMLElement, index: number) =>
  click(
    switches(host)
      [index].closest(".mds-choice")
      ?.querySelector(".mds-choice__label") as Element
  );

describe("public profile model", () => {
  it("names the hidden fields in form order, for the preview's 'Gizli:' line", () => {
    const all = { fullName: true, city: true, about: true, courses: true };
    expect(hiddenFields(all)).toEqual([]);
    expect(
      hiddenFields({
        fullName: false,
        city: false,
        about: true,
        courses: false,
      })
    ).toEqual(["fullName", "city", "courses"]);
    expect(
      hiddenLine(
        { fullName: false, city: true, about: false, courses: false },
        (f) => f
      )
    ).toBe("fullName, about, courses");
  });

  it("requires a künye (criterion 5) and sees a change only when something differs", () => {
    expect(validateProfile("  ")).toEqual({ kunye: "required" });
    expect(validateProfile("Zeynep")).toEqual({});
    const saved = { kunye: "A", gender: null, city: "", about: "" };
    expect(isDirty(saved, saved)).toBe(false);
    expect(isDirty({ ...saved, city: "Bursa" }, saved)).toBe(true);
    expect(isDirty({ ...saved, kunye: " A " }, saved)).toBe(false);
  });
});

describe("Herkese açık profil (design tedris/35)", () => {
  it("draws künye, gender and the four switches, with the always-public note and no switch for them", async () => {
    const host = await mount(profile());
    expect(host.textContent).toContain("Her zaman herkese açık");
    expect(
      (host.querySelector('input[name="kunye"]') as HTMLInputElement).value
    ).toBe("Zeynep Betül Üsküdârî");
    // Exactly four switches: ad ve soyad, şehir, hakkında, derslerin (criterion 1).
    expect(switches(host)).toHaveLength(4);
    expect(host.textContent).toContain("Zeynep Betül Karahanlı");
    expect(host.textContent).toContain("Emsile ve Bina · Siyer okumaları");
  });

  it("starts every switch as saved: the optional fields hidden unless the owner opened them (criterion 2)", async () => {
    const host = await mount(profile());
    expect(switches(host).map((s) => s.getAttribute("aria-checked"))).toEqual([
      "false",
      "false",
      "true",
      "false",
    ]);
  });

  it("previews who sees what: hidden fields listed in 'Gizli:', open ones shown (criterion 3)", async () => {
    const host = await mount(profile());
    const preview = host.querySelector("aside") as HTMLElement;
    expect(preview.textContent).toContain("Başkaları böyle görür");
    expect(preview.textContent).toContain("Sarf ve nahiv okuyorum.");
    expect(preview.textContent).not.toContain("İstanbul");
    expect(
      host.querySelector('[data-testid="preview-hidden"]')?.textContent
    ).toBe("Gizli: ad ve soyad, şehir, derslerin.");
  });

  it("saves a switch on its own and updates the preview at once", async () => {
    mocks.saveVisibility.mockResolvedValue({ success: true, data: profile() });
    const host = await mount(profile());
    await flip(host, 1);
    await settle();
    expect(mocks.saveVisibility).toHaveBeenCalledWith({ city: true });
    expect((host.querySelector("aside") as HTMLElement).textContent).toContain(
      "İstanbul"
    );
    expect(
      host.querySelector('[data-testid="preview-hidden"]')?.textContent
    ).toBe("Gizli: ad ve soyad, derslerin.");
  });

  it("rolls a switch back and says so when the API refuses", async () => {
    mocks.saveVisibility.mockResolvedValue({ success: false, error: "no" });
    const host = await mount(profile());
    await flip(host, 1);
    await settle();
    expect(switches(host)[1].getAttribute("aria-checked")).toBe("false");
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "error" })
    );
  });

  it("does not call the API with an empty künye (criterion 5)", async () => {
    const host = await mount(profile({ kunye: null }));
    await click(host.querySelector('button[type="submit"]') as HTMLElement);
    expect(mocks.saveTexts).not.toHaveBeenCalled();
    expect(host.textContent).toContain("İlmî künyeni yaz.");
  });

  it("saves the texts with 'Kaydet' and reports a taken künye on the field", async () => {
    mocks.saveTexts.mockResolvedValueOnce({
      success: false,
      error: "taken",
      status: 409,
    });
    const host = await mount(profile());
    await click(host.querySelector('button[type="submit"]') as HTMLElement);
    await settle();
    expect(mocks.saveTexts).toHaveBeenCalledWith(
      expect.objectContaining({ kunye: "Zeynep Betül Üsküdârî" })
    );
    expect(host.textContent).toContain("Bu künyeyi başka biri kullanıyor");

    mocks.saveTexts.mockResolvedValueOnce({ success: true, data: profile() });
    await click(host.querySelector('button[type="submit"]') as HTMLElement);
    await settle();
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "success" })
    );
  });
});
