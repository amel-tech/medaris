// @vitest-environment happy-dom
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle } from "./dom";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  create: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("next-intl", async (importOriginal) => {
  const real = await importOriginal<typeof import("next-intl")>();
  const { translatorFor } = await import("./decks-harness");
  return {
    ...real,
    useLocale: () => "tr",
    useTranslations: (ns: string) => translatorFor(real.createTranslator, ns),
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("~/features/flashcards/actions", () => ({ createDeck: mocks.create }));
vi.mock("@medaris/ui/mds/toast", () => ({
  useToaster: () => ({ notify: mocks.notify, dismiss: () => {} }),
}));

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});
afterEach(cleanup);

const mount = async () => {
  const { CreateDeckPage } = await import(
    "~/features/flashcards/components/create-deck-page"
  );
  return render(createElement(CreateDeckPage));
};

/** Types into a controlled React input the way a browser does. */
const type = async (
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
) => {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const field = (name: string) =>
  document.querySelector(`[name="${name}"]`) as HTMLInputElement;
const submit = async () => {
  await act(async () => {
    (document.querySelector("form") as HTMLFormElement).dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
  });
  await settle();
};
const radio = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="radio"]')].find((r) =>
    r.closest("label")?.textContent?.startsWith(label)
  ) as HTMLElement;

describe("Deste oluştur (design tedris/27)", () => {
  it("draws the form of the design and no visibility choice", async () => {
    await mount();
    expect(document.querySelector("h1")?.textContent).toBe("Deste oluştur");
    expect(document.body.textContent).toContain("* zorunlu alan");
    expect(document.body.textContent).toContain("Deste özel başlar");
    expect(document.body.textContent).not.toContain("Herkese açık");
    // The type has no default.
    expect(
      document.querySelectorAll('[role="radio"][aria-checked="true"]').length
    ).toBe(0);
    const cancel = [...document.querySelectorAll("a")].find(
      (a) => a.textContent === "Vazgeç"
    );
    expect(cancel?.getAttribute("href")).toBe("/decks");
  });

  it("an empty form says what is missing and sends nothing", async () => {
    await mount();
    await submit();
    expect(document.body.textContent).toContain("Bir deste adı yaz.");
    expect(document.body.textContent).toContain("Bir kart türü seç.");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("a name under five characters is refused, with the number", async () => {
    await mount();
    await type(field("title"), "abc");
    await submit();
    expect(document.body.textContent).toContain(
      "Deste adı en az 5 karakter olmalı."
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("the card type changes the preview", async () => {
    await mount();
    expect(document.body.textContent).toContain("Kelime kartı böyle görünür");
    await click(radio("Hadis"));
    expect(document.body.textContent).toContain("Hadis kartı böyle görünür");
    expect(document.body.textContent).toContain("Buhârî, Müslim");
    await click(radio("Kelime"));
    expect(document.body.textContent).toContain("Kelime kartı böyle görünür");
  });

  it("sends the trimmed name, the type and the parsed tags, then opens the new deck", async () => {
    mocks.create.mockResolvedValue({ success: true, data: { id: "new-deck" } });
    await mount();
    await type(field("title"), "  Yeni deste  ");
    await type(field("description"), "Bir açıklama.");
    await click(radio("Hadis"));
    await type(field("tags"), " sarf , nahiv,, Sarf ");
    await submit();
    expect(mocks.create).toHaveBeenCalledWith({
      title: "  Yeni deste  ",
      description: "Bir açıklama.",
      cardType: "HADEETH",
      tags: ["sarf", "nahiv"],
    });
    expect(mocks.push).toHaveBeenCalledWith("/decks/new-deck");
  });

  it("keeps what was typed and says so in a toast when the API refuses", async () => {
    mocks.create.mockResolvedValue({ success: false, error: "boom" });
    await mount();
    await type(field("title"), "Yeni deste");
    await click(radio("Kelime"));
    await submit();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "error", title: "Deste oluşturulamadı" })
    );
    expect(field("title").value).toBe("Yeni deste");
    expect(
      document
        .querySelector('[role="radio"][aria-checked="true"]')
        ?.closest("label")?.textContent
    ).toContain("Kelime");
  });

  it("one request at a time: a second submit while the first is out does nothing", async () => {
    let finish: (v: { success: true; data: { id: string } }) => void = () => {};
    mocks.create.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await mount();
    await type(field("title"), "Yeni deste");
    await click(radio("Kelime"));
    await submit();
    await submit();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    await act(async () => finish({ success: true, data: { id: "x" } }));
  });
});
