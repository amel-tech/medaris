// @vitest-environment happy-dom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { summary } from "./decks-harness";
import { cleanup, click, render } from "./dom";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next-intl", async (importOriginal) => {
  const real = await importOriginal<typeof import("next-intl")>();
  const { translatorFor } = await import("./decks-harness");
  return {
    ...real,
    useLocale: () => "tr",
    useTimeZone: () => "Europe/Istanbul",
    useTranslations: (ns: string) => translatorFor(real.createTranslator, ns),
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

beforeEach(() => mocks.refresh.mockReset());
afterEach(cleanup);

const mount = async (decks: ReturnType<typeof summary>[] | null) => {
  const { DecksPage } = await import(
    "~/features/flashcards/components/decks-page"
  );
  return render(createElement(DecksPage, { decks }));
};

const own = [
  summary({
    id: "a",
    title: "Emsile çekimleri",
    publishStatus: "PUBLISHED",
    cardCount: 36,
    masteredCount: 30,
    learningCount: 14,
    dueCount: 14,
  }),
  summary({
    id: "b",
    title: "Mehmûz fiiller",
    publishStatus: "PENDING",
    publishRequestedAt: new Date("2026-09-29T18:10:00Z"),
  }),
  summary({
    id: "c",
    title: "Riyâzü’s-Sâlihîn’den hadisler",
    publishStatus: "PRIVATE",
    cardType: "HADEETH",
    cardCount: 12,
    masteredCount: 2,
    learningCount: 0,
    dueCount: 0,
    description: null,
  }),
];
const collected = [
  summary({
    id: "k",
    title: "Kırk hadis",
    isMine: false,
    authorId: "other",
    source: "COLLECTION",
    collectionKind: "PUBLIC",
    inCollection: true,
    cardType: "HADEETH",
    cardCount: 40,
    masteredCount: 12,
    learningCount: 0,
    dueCount: 0,
    addedSinceCollectedCount: 5,
  }),
  summary({
    id: "e",
    title: "Emsile’nin altı bâbı",
    isMine: false,
    authorId: "other",
    source: "COLLECTION",
    collectionKind: "COURSE",
    contextTitle: "Emsile ve Bina",
    muderrisName: "Abdülhamit Karaosmanoğlu",
    cardCount: 48,
    masteredCount: 20,
    learningCount: 0,
    dueCount: 0,
  }),
];

const section = (name: string) =>
  [...document.body.querySelectorAll("section")].find(
    (s) => s.querySelector("h2")?.textContent === name
  ) as HTMLElement;
const titles = (root: ParentNode) =>
  [...root.querySelectorAll(".mds-card__link > span > span:last-child")].map(
    (n) => n.textContent
  );

describe("Desteler (design tedris/25)", () => {
  it("lists the caller's decks under Destelerim and the collected ones under Koleksiyonum", async () => {
    await mount([...own, ...collected]);
    expect(document.querySelector("h1")?.textContent).toBe("Desteler");
    expect(titles(section("Destelerim"))).toEqual([
      "Emsile çekimleri",
      "Mehmûz fiiller",
      "Riyâzü’s-Sâlihîn’den hadisler",
    ]);
    expect(titles(section("Koleksiyonum"))).toEqual([
      "Kırk hadis",
      "Emsile’nin altı bâbı",
    ]);
    expect(section("Destelerim").textContent).toContain("3 deste");
    expect(section("Koleksiyonum").textContent).toContain("2 deste");
  });

  it("each own deck carries its status, progress, due count, size, kind and, when asked, the date", async () => {
    await mount([...own, ...collected]);
    const mine = section("Destelerim");
    const cards = [...mine.querySelectorAll(".mds-card")];
    expect(cards[0].textContent).toContain("Yayında");
    expect(cards[0].textContent).toContain("Tamamlanan: 30 / 36 kart");
    expect(cards[0].textContent).toContain("%83");
    expect(cards[0].textContent).toContain("14 kart tekrar bekliyor");
    expect(cards[1].textContent).toContain("Yayın isteği bekliyor");
    expect(cards[1].textContent).toContain(
      "18 kart·Kelime·29 Eylül’de istendi"
    );
    expect(cards[2].textContent).toContain("Özel");
    expect(cards[2].textContent).toContain("12 kart·Hadis");
    // No due line when nothing is due.
    expect(cards[2].textContent).not.toContain("tekrar bekliyor");
    // Only a waiting request has a date.
    expect(cards[0].textContent).not.toContain("istendi");
  });

  it("'Çalış' is named for its deck and goes to its study page", async () => {
    await mount([...own]);
    const study = document.querySelector(
      'a[aria-label="Çalış: Mehmûz fiiller"]'
    ) as HTMLAnchorElement;
    expect(study.getAttribute("href")).toBe("/decks/study/b");
    expect(study.textContent).toBe("Çalış");
  });

  it("a collected deck says where it comes from and what is new, and has no edit action", async () => {
    await mount([...own, ...collected]);
    const cards = [...section("Koleksiyonum").querySelectorAll(".mds-card")];
    expect(cards[0].textContent).toContain("Herkese açık");
    expect(cards[0].textContent).toContain("5 yeni kart");
    expect(cards[1].textContent).toContain("Ders destesi");
    expect(cards[1].textContent).toContain(
      "Emsile ve Bina·Müderris Abdülhamit Karaosmanoğlu"
    );
    expect(section("Koleksiyonum").textContent).not.toContain("Düzenle");
    expect(section("Koleksiyonum").querySelectorAll("button").length).toBe(0);
  });

  it("the status chips narrow only the caller's own decks", async () => {
    await mount([...own, ...collected]);
    const chips = [
      ...document.querySelectorAll<HTMLButtonElement>(".mds-chip"),
    ];
    expect(chips.map((c) => c.textContent)).toEqual([
      "Tümü",
      "Özel",
      "Yayın isteği bekliyor",
      "Yayında",
    ]);
    await click(chips[2]);
    expect(chips[2].getAttribute("aria-pressed")).toBe("true");
    expect(titles(section("Destelerim"))).toEqual(["Mehmûz fiiller"]);
    expect(section("Destelerim").textContent).toContain("1 deste");
    expect(titles(section("Koleksiyonum"))).toHaveLength(2);
    await click(chips[1]);
    expect(titles(section("Destelerim"))).toEqual([
      "Riyâzü’s-Sâlihîn’den hadisler",
    ]);
    await click(chips[0]);
    expect(titles(section("Destelerim"))).toHaveLength(3);
  });

  it("says what is empty: no decks at all, no deck of a status, no deck for a search", async () => {
    await mount([]);
    expect(section("Destelerim").textContent).toContain(
      "Henüz bir deste oluşturmadın."
    );
    expect(section("Destelerim").querySelector("a")?.getAttribute("href")).toBe(
      "/decks/create"
    );
    expect(section("Koleksiyonum").textContent).toContain(
      "Koleksiyonunda henüz deste yok."
    );
    await cleanup();

    await mount([own[0], ...collected]);
    const chips = [
      ...document.querySelectorAll<HTMLButtonElement>(".mds-chip"),
    ];
    await click(chips[2]);
    expect(section("Destelerim").textContent).toContain(
      "Bu durumda deste yok."
    );
  });

  it("asks again when the server could not read the decks", async () => {
    await mount(null);
    expect(document.body.textContent).toContain("Desteler yüklenemedi");
    const retry = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Yeniden dene"
    ) as HTMLButtonElement;
    await click(retry);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("links to Keşfet and Deste oluştur", async () => {
    await mount(own);
    const hrefs = Object.fromEntries(
      [...document.querySelectorAll("main > div a")].map((a) => [
        a.textContent,
        a.getAttribute("href"),
      ])
    );
    expect(hrefs["Desteleri keşfet"]).toBe("/decks/explore");
    expect(hrefs["Deste oluştur"]).toBe("/decks/create");
  });
});
