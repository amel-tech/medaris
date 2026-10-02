// @vitest-environment happy-dom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cardRow, deckResponse } from "./decks-harness";
import { cleanup, click, render } from "./dom";

vi.mock("next-intl", async (importOriginal) => {
  const real = await importOriginal<typeof import("next-intl")>();
  const { translatorFor } = await import("./decks-harness");
  return {
    ...real,
    useLocale: () => "tr",
    useTranslations: (ns: string) => translatorFor(real.createTranslator, ns),
  };
});
vi.mock("~/features/flashcards/actions", () => ({}));

afterEach(cleanup);

const mount = async (cardCount = 8) => {
  const { DeckPublicView } = await import(
    "~/features/flashcards/components/deck-public-view"
  );
  return render(
    createElement(DeckPublicView, {
      deck: deckResponse({
        title: "Kırk hadis",
        isPublic: true,
        cardType: "HADEETH",
        publishStatus: "PUBLISHED",
        authorId: "someone",
        description: "İmam Nevevî’nin Erbaîn’inden kırk hadis.",
      }),
      cards: Array.from({ length: cardCount }, (_, i) => cardRow(i + 1)),
      signInHref: "/tr/auth/signin?callbackUrl=%2Fdecks%2Fd1",
    })
  );
};
const text = () => document.body.textContent ?? "";

describe("Deste, girişsiz ziyaretçi (design tedris/32)", () => {
  it("opens with Keşfet in the path, the name, 'Herkese açık', the meta line and the description", async () => {
    await mount();
    expect(document.querySelector("h1")?.textContent).toBe("Kırk hadis");
    expect(
      [...document.querySelectorAll(".mds-breadcrumb__list li")].map((c) =>
        c.textContent?.replace(/\/$/, "")
      )
    ).toEqual(["Keşfet", "Kırk hadis"]);
    const header = document.querySelector("header") as HTMLElement;
    expect(header.textContent).toContain("Herkese açık");
    expect(header.textContent).toContain("8 ezber kartı·Hadis");
    expect(header.textContent).toContain("İmam Nevevî’nin Erbaîn’inden");
    const study = [...header.querySelectorAll("a")].find(
      (a) => a.textContent === "Çalış"
    );
    expect(study?.getAttribute("href")).toBe("/decks/study/d1");
  });

  it("tells the visitor nothing is saved and links the sign-in", async () => {
    await mount();
    expect(text()).toContain(
      "Giriş yapmadan çalışırsan ilerlemen kaydedilmez."
    );
    const link = [...document.querySelectorAll("a")].find(
      (a) => a.textContent === "Kaydetmek için giriş yap"
    );
    expect(link?.getAttribute("href")).toBe(
      "/tr/auth/signin?callbackUrl=%2Fdecks%2Fd1"
    );
  });

  it("has no collection, copy or progress controls: they are somebody's", async () => {
    await mount();
    const labels = [...document.querySelectorAll("button, a")].map(
      (n) => n.textContent
    );
    expect(labels.some((l) => /Koleksiyon|kopyala|Çıkar/i.test(l ?? ""))).toBe(
      false
    );
    expect(text()).not.toContain("Çalışma durumun");
    expect(document.querySelectorAll("thead th")).toHaveLength(2);
    expect(text()).toContain("Deste hakkında");
  });

  it("shows six cards at a time", async () => {
    await mount(14);
    expect(document.querySelectorAll("tbody tr")).toHaveLength(6);
    expect(text()).toContain("14 kartın 6 tanesi gösteriliyor");
    const more = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Daha fazla göster"
    ) as HTMLElement;
    await click(more);
    expect(document.querySelectorAll("tbody tr")).toHaveLength(12);
    await click(
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent === "Daha fazla göster"
      ) as HTMLElement
    );
    expect(document.querySelectorAll("tbody tr")).toHaveLength(14);
    expect(text()).toContain("14 kartın 14 tanesi gösteriliyor");
    expect(
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent === "Daha fazla göster"
      )
    ).toBe(false);
  });

  it("says so when the deck has no card", async () => {
    await mount(0);
    expect(text()).toContain("Bu destede henüz kart yok.");
  });
});
