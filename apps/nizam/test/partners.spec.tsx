// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type {
  PartnerAdminListResponse,
  PartnerAdminResponse,
} from "@medaris/services/tedrisat";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PartnersView } from "~/features/partners/components/partners-view";
import {
  clientIdProblem,
  failureKey,
  nameProblem,
  sameKosks,
} from "~/features/partners/present";
import { cleanup, click, render, settle, type as typeInto } from "./dom";

/**
 * "Ortak uygulamalar" (partner enrollments): the list with each partner's
 * name, client id, köşks and switch; adding one; renaming; switching it off
 * and on; choosing its köşks. The three actions are stubs answering as
 * tedrisat does.
 */

const actions = vi.hoisted(() => ({
  createPartner: vi.fn(),
  updatePartner: vi.fn(),
  setPartnerKosks: vi.fn(),
}));
vi.mock("~/features/partners/actions", () => actions);
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@medaris/ui/components/sonner", () => ({ toast }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
}));

const tr = resources.tr.nizam.PartnersPage;

const ORNEK = {
  id: "k0000000-0000-4000-8000-000000000001",
  name: "Örnek Köşkü",
};
const BASKA = {
  id: "k0000000-0000-4000-8000-000000000002",
  name: "Başka Köşk",
};

const partner = (over: Partial<PartnerAdminResponse> = {}) =>
  ({
    clientId: "ornek-uygulama",
    name: "Örnek Uygulama",
    enabled: true,
    createdAt: new Date("2026-10-14T09:00:00Z"),
    kosks: [ORNEK],
    ...over,
  }) as PartnerAdminResponse;

const list = (
  items: PartnerAdminResponse[] = [partner()]
): PartnerAdminListResponse => ({ items, kosks: [BASKA, ORNEK] });

let host: HTMLElement;
const mount = async (initial: PartnerAdminListResponse | null = list()) => {
  host = await render(
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={{ nizam: resources.tr.nizam } as never}
    >
      <PartnersView initial={initial} />
    </NextIntlClientProvider>
  );
};

const page = () => host.textContent ?? "";
const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.replace(/\s+/g, " ").trim() === label
  ) as HTMLButtonElement;
const field = (root: ParentNode, name: string) =>
  root.querySelector(`input[name="${name}"]`) as HTMLInputElement;
const addForm = () =>
  host.querySelector('[data-testid="partners-add"]') as HTMLElement;
/** The row's switch: its label carries the partner's name for the screen reader. */
const switchOf = (name: string) =>
  [...host.querySelectorAll("label.mds-choice")].find((l) =>
    l.textContent?.includes(name)
  ) as HTMLElement;
const isOn = (name: string) =>
  switchOf(name)
    .querySelector("[role=switch]")
    ?.getAttribute("aria-checked") === "true";
const dialog = () => document.querySelector(".mds-dialog") as HTMLElement;
const box = (kosk: string) =>
  [...dialog().querySelectorAll("label.mds-choice")].find(
    (l) => l.textContent === kosk
  ) as HTMLElement;
const ticked = (kosk: string) =>
  box(kosk).querySelector("[role=checkbox]")?.getAttribute("aria-checked") ===
  "true";
const submit = async (root: HTMLElement) => {
  const form = root.querySelector("form") ?? root.closest("form");
  await act(async () => {
    (form as HTMLFormElement).dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
  });
  await settle(40);
};

beforeEach(() => {
  for (const fn of [
    actions.createPartner,
    actions.updatePartner,
    actions.setPartnerKosks,
    toast.success,
    toast.error,
    refresh,
  ]) {
    fn.mockReset();
  }
});
afterEach(async () => {
  await cleanup();
});

describe("Ortak uygulamalar: the list", () => {
  it("shows each partner's name, client id, köşks and whether it is on", async () => {
    await mount(
      list([
        partner(),
        partner({
          clientId: "ikinci-uygulama",
          name: "İkinci Uygulama",
          enabled: false,
          kosks: [],
        }),
      ])
    );
    expect(page()).toContain(tr.title);
    expect(page()).toContain("Örnek Uygulama");
    expect(page()).toContain("ornek-uygulama");
    expect(page()).toContain("Örnek Köşkü");
    expect(page()).toContain("ikinci-uygulama");
    expect(page()).toContain(tr.noKosks);
    expect(isOn("Örnek Uygulama")).toBe(true);
    expect(isOn("İkinci Uygulama")).toBe(false);
  });

  it("says so when none is registered, and offers a retry when the read failed", async () => {
    await mount(list([]));
    expect(page()).toContain(tr.empty);
    await cleanup();
    await mount(null);
    expect(page()).toContain(tr.loadFailedTitle);
    await click(button(host, tr.retry));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("Ortak uygulamalar: adding one", () => {
  it("checks the client id and the name before sending anything", async () => {
    await mount();
    await submit(addForm());
    expect(addForm().textContent).toContain(tr.errors.clientId.empty);
    expect(addForm().textContent).toContain(tr.errors.name.empty);
    await typeInto(field(addForm(), "clientId"), "ornek uygulama");
    await typeInto(field(addForm(), "name"), "Yeni");
    await submit(addForm());
    expect(addForm().textContent).toContain(tr.errors.clientId.shape);
    expect(actions.createPartner).not.toHaveBeenCalled();
  });

  it("sends it trimmed, lists it and empties the form", async () => {
    actions.createPartner.mockResolvedValue({
      success: true,
      data: partner({
        clientId: "yeni-uygulama",
        name: "Yeni Uygulama",
        kosks: [],
      }),
    });
    await mount();
    await typeInto(field(addForm(), "clientId"), " yeni-uygulama ");
    await typeInto(field(addForm(), "name"), "  Yeni Uygulama ");
    await submit(addForm());
    expect(actions.createPartner).toHaveBeenCalledExactlyOnceWith(
      "yeni-uygulama",
      "Yeni Uygulama"
    );
    expect(page()).toContain("yeni-uygulama");
    expect(field(addForm(), "clientId").value).toBe("");
    expect(toast.success).toHaveBeenCalledWith(tr.added, expect.anything());
  });

  it("says under the field when the id is registered already or is one of Medaris's own", async () => {
    await mount();
    await typeInto(field(addForm(), "clientId"), "ornek-uygulama");
    await typeInto(field(addForm(), "name"), "Örnek");
    actions.createPartner.mockResolvedValueOnce({
      success: false,
      error: "",
      errorBody: { code: "PARTNER_EXISTS" },
    });
    await submit(addForm());
    expect(addForm().textContent).toContain(tr.errors.exists);
    await typeInto(field(addForm(), "clientId"), "tedris-web");
    actions.createPartner.mockResolvedValueOnce({
      success: false,
      error: "",
      errorBody: { code: "PARTNER_FRONT_END_CLIENT" },
    });
    await submit(addForm());
    expect(addForm().textContent).toContain(tr.errors.frontEnd);
  });
});

describe("Ortak uygulamalar: switching one off and on", () => {
  it("switches it off at once, and says what that means", async () => {
    actions.updatePartner.mockResolvedValue({
      success: true,
      data: partner({ enabled: false }),
    });
    await mount();
    await click(switchOf("Örnek Uygulama"));
    await settle(40);
    expect(actions.updatePartner).toHaveBeenCalledExactlyOnceWith(
      "ornek-uygulama",
      { enabled: false }
    );
    expect(isOn("Örnek Uygulama")).toBe(false);
    expect(toast.success).toHaveBeenCalledWith(tr.turnedOff, {
      description: tr.turnedOffBody.replace("{name}", "Örnek Uygulama"),
    });
  });

  it("moves the switch back, with a toast that stays, when the server refuses", async () => {
    actions.updatePartner.mockResolvedValue({
      success: false,
      error: "",
      errorBody: { code: "AUTHZ_FORBIDDEN" },
    });
    await mount();
    await click(switchOf("Örnek Uygulama"));
    await settle(40);
    expect(isOn("Örnek Uygulama")).toBe(true);
    expect(toast.error).toHaveBeenCalledWith(tr.saveFailed, {
      description: tr.errors.forbidden,
      duration: Number.POSITIVE_INFINITY,
    });
  });

  it("moves back only the row the server refused, while another row switched meanwhile keeps its change", async () => {
    const answers = new Map<string, (answer: unknown) => void>();
    actions.updatePartner.mockImplementation(
      (clientId: string) =>
        new Promise((resolve) => {
          answers.set(clientId, resolve);
        })
    );
    await mount(
      list([
        partner(),
        partner({ clientId: "ikinci-uygulama", name: "İkinci Uygulama" }),
      ])
    );

    await click(switchOf("Örnek Uygulama"));
    await click(switchOf("İkinci Uygulama"));
    await settle(20);
    expect(isOn("Örnek Uygulama")).toBe(false);
    expect(isOn("İkinci Uygulama")).toBe(false);

    // The first one is refused while the second is still on its way.
    await act(async () => {
      answers.get("ornek-uygulama")?.({
        success: false,
        error: "",
        errorBody: { code: "AUTHZ_FORBIDDEN" },
      });
    });
    await settle(20);
    expect(isOn("Örnek Uygulama")).toBe(true);
    expect(isOn("İkinci Uygulama")).toBe(false);

    await act(async () => {
      answers.get("ikinci-uygulama")?.({
        success: true,
        data: partner({
          clientId: "ikinci-uygulama",
          name: "İkinci Uygulama",
          enabled: false,
        }),
      });
    });
    await settle(20);
    expect(isOn("Örnek Uygulama")).toBe(true);
    expect(isOn("İkinci Uygulama")).toBe(false);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});

describe("Ortak uygulamalar: renaming", () => {
  it("renames it in a dialog and shows the new name", async () => {
    actions.updatePartner.mockResolvedValue({
      success: true,
      data: partner({ name: "Örnek Uygulama 2" }),
    });
    await mount();
    await click(button(host, `${tr.rename} Örnek Uygulama`));
    await settle(40);
    expect(dialog().textContent).toContain(tr.renameTitle);
    expect(field(dialog(), "name").value).toBe("Örnek Uygulama");
    await typeInto(field(dialog(), "name"), " ");
    await submit(dialog());
    expect(dialog().textContent).toContain(tr.errors.name.empty);
    await typeInto(field(dialog(), "name"), "Örnek Uygulama 2 ");
    await submit(dialog());
    expect(actions.updatePartner).toHaveBeenCalledExactlyOnceWith(
      "ornek-uygulama",
      { name: "Örnek Uygulama 2" }
    );
    await settle(40);
    expect(page()).toContain("Örnek Uygulama 2");
  });
});

describe("Ortak uygulamalar: choosing the köşks", () => {
  const open = async () => {
    await mount();
    await click(button(host, `${tr.chooseKosks} Örnek Uygulama`));
    await settle(40);
  };

  it("ticks the köşks it works with, among every köşk", async () => {
    await open();
    expect(dialog().textContent).toContain(tr.kosksTitle);
    expect(ticked("Örnek Köşkü")).toBe(true);
    expect(ticked("Başka Köşk")).toBe(false);
    expect(dialog().textContent).toContain("1 köşk seçili");
  });

  it("binds one more and unbinds one, in one save", async () => {
    actions.setPartnerKosks.mockResolvedValue({
      success: true,
      data: partner({ kosks: [BASKA] }),
    });
    await open();
    await click(box("Başka Köşk"));
    await click(box("Örnek Köşkü"));
    await settle(20);
    expect(ticked("Başka Köşk")).toBe(true);
    expect(ticked("Örnek Köşkü")).toBe(false);
    await submit(dialog());
    expect(actions.setPartnerKosks).toHaveBeenCalledExactlyOnceWith(
      "ornek-uygulama",
      [BASKA.id]
    );
    await settle(40);
    expect(toast.success).toHaveBeenCalledWith(tr.kosksSaved, {
      description: "Örnek Uygulama artık 1 köşkle çalışıyor.",
    });
    expect(page()).toContain("Başka Köşk");
    expect(page()).not.toContain("Örnek Köşkü");
  });

  it("unbinds every köşk, and sends nothing when nothing changed", async () => {
    actions.setPartnerKosks.mockResolvedValue({
      success: true,
      data: partner({ kosks: [] }),
    });
    await open();
    await submit(dialog());
    expect(actions.setPartnerKosks).not.toHaveBeenCalled();

    await click(button(host, `${tr.chooseKosks} Örnek Uygulama`));
    await settle(40);
    await click(box("Örnek Köşkü"));
    await submit(dialog());
    expect(actions.setPartnerKosks).toHaveBeenCalledExactlyOnceWith(
      "ornek-uygulama",
      []
    );
    await settle(40);
    expect(page()).toContain(tr.noKosks);
  });

  it("says in the dialog when a köşk is gone meanwhile", async () => {
    actions.setPartnerKosks.mockResolvedValue({
      success: false,
      error: "",
      errorBody: { code: "KOSK_NOT_FOUND" },
    });
    await open();
    await click(box("Başka Köşk"));
    await submit(dialog());
    expect(dialog().textContent).toContain(tr.errors.koskGone);
  });
});

describe("Ortak uygulamalar: rules and words", () => {
  it("knows a client id and a name it cannot send", () => {
    expect(clientIdProblem("")).toBe("empty");
    expect(clientIdProblem("-ornek")).toBe("shape");
    expect(clientIdProblem("ornek uygulama")).toBe("shape");
    expect(clientIdProblem("ornek.uygulama_2-a")).toBeNull();
    expect(nameProblem("  ")).toBe("empty");
    expect(nameProblem("x".repeat(101))).toBe("long");
    expect(nameProblem(` ${"x".repeat(100)} `)).toBeNull();
  });

  it("compares two köşk selections in any order", () => {
    expect(sameKosks(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameKosks(["a"], ["a", "b"])).toBe(false);
    expect(sameKosks([], [])).toBe(true);
  });

  it("has a message in every locale for every key it builds", () => {
    const keys = [
      ...[
        "PARTNER_EXISTS",
        "PARTNER_FRONT_END_CLIENT",
        "PARTNER_UNKNOWN",
        "KOSK_NOT_FOUND",
        "VALIDATION_ERROR",
        "AUTHZ_FORBIDDEN",
        "SOMETHING_NEW",
      ].map((code) => failureKey({ code })),
      failureKey(undefined),
      "errors.clientId.empty",
      "errors.clientId.shape",
      "errors.name.empty",
      "errors.name.long",
    ];
    for (const locale of ["tr", "en", "ar"] as const) {
      const t = createTranslator({
        locale,
        messages: resources[locale].nizam,
        namespace: "PartnersPage",
      });
      for (const key of keys) {
        expect(t.has(key as never), `${locale} ${key}`).toBe(true);
      }
      expect(
        (resources[locale].nizam as { Shell: { items: { partners?: string } } })
          .Shell.items.partners,
        locale
      ).toBeTruthy();
    }
  });
});
