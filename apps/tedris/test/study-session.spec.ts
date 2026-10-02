// @vitest-environment happy-dom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cardRow, deckResponse } from "./decks-harness";
import { cleanup, click, key, render, settle } from "./dom";

const mocks = vi.hoisted(() => ({ rate: vi.fn(), notify: vi.fn() }));
vi.mock("next-intl", async (importOriginal) => {
  const real = await importOriginal<typeof import("next-intl")>();
  const { translatorFor } = await import("./decks-harness");
  return {
    ...real,
    useLocale: () => "tr",
    useTranslations: (ns: string) => translatorFor(real.createTranslator, ns),
  };
});
vi.mock("~/features/flashcards/actions", () => ({
  rateFlashcard: mocks.rate,
}));
vi.mock("@medaris/ui/mds/toast", () => ({
  useToaster: () => ({ notify: mocks.notify, dismiss: () => {} }),
}));

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.rate.mockResolvedValue({ success: true, data: [] });
});
afterEach(cleanup);

type Props = Parameters<
  typeof import("~/features/flashcards/components/study-session").StudySession
>[0];
const deck = deckResponse();
const mount = async (over: Partial<Props> = {}) => {
  const { StudySession } = await import(
    "~/features/flashcards/components/study-session"
  );
  return render(
    createElement(StudySession, {
      deck: { id: deck.id, title: deck.title },
      cards: [cardRow(1, "LEARNING"), cardRow(2, "LEARNING"), cardRow(3)],
      dueCount: 2,
      newCount: 1,
      signedIn: true,
      root: { label: "Desteler", href: "/decks" },
      ...over,
    })
  );
};
const byText = (selector: string, text: string) =>
  [...document.querySelectorAll<HTMLElement>(selector)].find(
    (n) => n.textContent === text
  ) as HTMLElement;
const button = (text: string) => byText("button", text);
const main = () => document.querySelector("main")?.textContent ?? "";

describe("Çalışma (design tedris/30)", () => {
  it("opens on the first card with the round's numbers, and the back hidden", async () => {
    await mount();
    expect(document.querySelector("h1")?.textContent).toBe("Çalışma");
    expect(main()).toContain("Mehmûz fiiller · Bugün tekrar bekleyen 2 kart");
    expect(main()).toContain("Bu tur: 0 / 3 kart");
    expect(main()).toContain("Kart 1 / 3");
    expect(main()).toContain("Öğreniliyor");
    expect(main()).toContain("أَخَذَ 1");
    expect(main()).not.toContain("Aldı 1");
    expect(main()).not.toContain("Ne kadar zordu?");
    const crumbs = [...document.querySelectorAll(".mds-breadcrumb__list li")];
    expect(crumbs.map((c) => c.textContent?.replace(/\/$/, ""))).toEqual([
      "Desteler",
      "Mehmûz fiiller",
      "Çalışma",
    ]);
    const finish = byText("a", "Çalışmayı bitir");
    expect(finish.getAttribute("href")).toBe("/decks/d1");
  });

  it("names the subtitle by the round: only new cards when none is due", async () => {
    await mount({ dueCount: 0, newCount: 3 });
    expect(main()).toContain("Mehmûz fiiller · 3 yeni kart");
  });

  it("turns the card over by the button and by the space bar, and shows the ratings", async () => {
    await mount();
    await click(button("Arka yüzü göster"));
    expect(main()).toContain("Aldı 1");
    expect(main()).toContain("Arka yüz");
    expect(main()).toContain("Ne kadar zordu?");
    expect(["Zor", "Orta", "Kolay"].map((n) => !!button(n))).toEqual([
      true,
      true,
      true,
    ]);
    await cleanup();

    await mount();
    await key(document.body, " ");
    expect(main()).toContain("Ne kadar zordu?");
  });

  it("rates a card once, with the rating, and moves on to the next face-down", async () => {
    await mount();
    await click(button("Arka yüzü göster"));
    await click(button("Kolay"));
    await settle();
    expect(mocks.rate).toHaveBeenCalledTimes(1);
    expect(mocks.rate).toHaveBeenCalledWith("c1", "EASY");
    expect(main()).toContain("Bu tur: 1 / 3 kart");
    expect(main()).toContain("Kart 2 / 3");
    expect(main()).toContain("%33");
    expect(main()).not.toContain("Ne kadar zordu?");
  });

  it("maps the three buttons to the three ratings", async () => {
    await mount({ cards: [cardRow(1), cardRow(2), cardRow(3)] });
    for (const [name, rating] of [
      ["Zor", "HARD"],
      ["Orta", "MEDIUM"],
      ["Kolay", "EASY"],
    ]) {
      await click(button("Arka yüzü göster"));
      await click(button(name));
      await settle();
      expect(mocks.rate).toHaveBeenLastCalledWith(expect.any(String), rating);
    }
  });

  it("keeps the card and says so when the write fails", async () => {
    mocks.rate.mockResolvedValue({ success: false, error: "boom" });
    await mount();
    await click(button("Arka yüzü göster"));
    await click(button("Zor"));
    await settle();
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: "error",
        title: "İlerlemen kaydedilemedi",
      })
    );
    expect(main()).toContain("Kart 1 / 3");
    expect(main()).toContain("Ne kadar zordu?");
  });

  it("ends the round with a summary and the way back to the deck", async () => {
    await mount({ cards: [cardRow(1)], dueCount: 1, newCount: 0 });
    await click(button("Arka yüzü göster"));
    await click(button("Kolay"));
    await settle();
    expect(main()).toContain("Tur bitti");
    expect(main()).toContain("1 kartı çalıştın.");
    expect(byText("a", "Desteye dön").getAttribute("href")).toBe("/decks/d1");
  });

  it("says the day is done when nothing waits", async () => {
    await mount({ cards: [], dueCount: 0, newCount: 0 });
    expect(main()).toContain("Bugün için bitti");
    expect(main()).toContain("Bugün tekrar bekleyen kartın yok.");
  });
});

describe("Çalışma, girişsiz ziyaretçi (design tedris/32)", () => {
  it("studies the same way and writes nothing", async () => {
    await mount({
      signedIn: false,
      signInHref: "/tr/auth/signin?callbackUrl=%2Fdecks%2Fstudy%2Fd1",
      root: { label: "Keşfet", href: "/discover" },
    });
    expect(main()).toContain(
      "Giriş yapmadan çalışırsan ilerlemen kaydedilmez."
    );
    expect(byText("a", "Kaydetmek için giriş yap").getAttribute("href")).toBe(
      "/tr/auth/signin?callbackUrl=%2Fdecks%2Fstudy%2Fd1"
    );
    expect(main()).toContain("Mehmûz fiiller · 3 kart");
    expect(main()).not.toContain("Öğreniliyor");
    await click(button("Arka yüzü göster"));
    await click(button("Orta"));
    await settle();
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(main()).toContain("Bu tur: 1 / 3 kart");
    expect(
      [...document.querySelectorAll(".mds-breadcrumb__list li")][0].textContent
    ).toContain("Keşfet");
  });

  it("does not offer the sign-in link without an address for it", async () => {
    await mount({ signedIn: false });
    expect(byText("a", "Kaydetmek için giriş yap")).toBeUndefined();
  });
});
