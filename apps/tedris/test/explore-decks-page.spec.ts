// @vitest-environment happy-dom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { summary } from "./decks-harness";
import { cleanup, click, render } from "./dom";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  notify: vi.fn(),
}));
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
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  usePathname: () => "/tr/decks/explore",
}));
vi.mock("~/features/flashcards/actions", () => ({
  addDeckToCollection: mocks.add,
  removeDeckFromCollection: mocks.remove,
}));
vi.mock("@medaris/ui/mds/toast", () => ({
  useToaster: () => ({ notify: mocks.notify, dismiss: () => {} }),
}));

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});
afterEach(cleanup);

const other = {
  isMine: false,
  authorId: "other",
  source: "COLLECTION",
} as const;
const course = summary({
  ...other,
  id: "course",
  title: "Emsile’nin altı bâbı",
  collectionKind: "COURSE",
  contextTitle: "Emsile ve Bina",
  muderrisName: "Abdülhamit Karaosmanoğlu",
  cardCount: 48,
  masteredCount: 20,
  inCollection: true,
});
const koskDeck = summary({
  ...other,
  id: "kosk",
  title: "Sarfın temel kelimeleri",
  collectionKind: "KOSK",
  contextTitle: "Nûruosmaniye Köşkü",
  cardCount: 32,
  masteredCount: 0,
  learningCount: 0,
});
const data = {
  courseDecks: [course, koskDeck],
  publicDecks: [
    summary({
      ...other,
      id: "pub",
      title: "Kırk hadis",
      collectionKind: "PUBLIC",
      cardType: "HADEETH",
      masteredCount: 0,
      learningCount: 0,
    }),
    summary({
      id: "mine",
      title: "Emsile çekimleri",
      publishStatus: "PUBLISHED",
    }),
  ],
} as never;

const mount = async (
  props: Partial<{ data: unknown; cardType: string | null }> = {}
) => {
  const { ExploreDecksPage } = await import(
    "~/features/flashcards/components/explore-decks-page"
  );
  return render(
    createElement(ExploreDecksPage, {
      data: data,
      cardType: null,
      ...props,
    } as never)
  );
};
const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.getAttribute("aria-label") === name || b.textContent === name
  );
const section = (name: string) =>
  [...document.body.querySelectorAll("section")].find(
    (s) => s.querySelector("h2")?.textContent === name
  ) as HTMLElement;

describe("Desteleri keşfet (design tedris/26)", () => {
  it("shows both sections with their real counts, the kind badge and where a deck belongs", async () => {
    await mount();
    expect(document.querySelector("h1")?.textContent).toBe("Desteleri keşfet");
    expect(section("Derslerinin desteleri").textContent).toContain("2 deste");
    expect(section("Herkese açık desteler").textContent).toContain("2 deste");
    const first = section("Derslerinin desteleri").querySelector(".mds-card");
    expect(first?.textContent).toContain("Ders destesi");
    expect(first?.textContent).toContain(
      "Emsile ve Bina·Müderris Abdülhamit Karaosmanoğlu"
    );
    // Public decks have no kind badge.
    expect(
      [...section("Herkese açık desteler").querySelectorAll(".mds-badge")].map(
        (n) => n.textContent
      )
    ).toEqual([]);
  });

  it("a collected deck shows 'Koleksiyonunda' with 'Çıkar' and its progress; one that is not shows 'Koleksiyona ekle'", async () => {
    await mount();
    const cards = [
      ...section("Derslerinin desteleri").querySelectorAll(".mds-card"),
    ];
    expect(cards[0].textContent).toContain("Koleksiyonunda");
    expect(cards[0].textContent).toContain("Tamamlanan: 20 / 48 kart");
    expect(
      button("Koleksiyondan çıkar: Emsile’nin altı bâbı")?.textContent
    ).toBe("Çıkar");
    expect(cards[1].textContent).not.toContain("Tamamlanan");
    expect(button("Koleksiyona ekle: Sarfın temel kelimeleri")).toBeTruthy();
  });

  it("the caller's own deck says so and offers neither add nor remove", async () => {
    await mount();
    const own = [
      ...section("Herkese açık desteler").querySelectorAll(".mds-card"),
    ][1];
    expect(own.textContent).toContain("Senin desten");
    expect(own.querySelectorAll("button").length).toBe(0);
  });

  it("'Koleksiyona ekle' flips at once, asks the API once, and refreshes", async () => {
    let finish: (v: { success: true; data: true }) => void = () => {};
    mocks.add.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await mount();
    const add = button(
      "Koleksiyona ekle: Sarfın temel kelimeleri"
    ) as HTMLElement;
    await click(add);
    expect(mocks.add).toHaveBeenCalledWith("kosk");
    expect(button("Koleksiyondan çıkar: Sarfın temel kelimeleri")).toBeTruthy();
    expect(document.body.textContent).toContain("Koleksiyonunda");
    // Busy while the request is out: a second click is not a second request.
    await click(
      button("Koleksiyondan çıkar: Sarfın temel kelimeleri") as HTMLElement
    );
    expect(mocks.remove).not.toHaveBeenCalled();
    const { act } = await import("react");
    await act(async () => finish({ success: true, data: true }));
    expect(mocks.refresh).toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("'Çıkar' flips back and asks the API to remove", async () => {
    mocks.remove.mockResolvedValue({ success: true, data: true });
    await mount();
    await click(
      button("Koleksiyondan çıkar: Emsile’nin altı bâbı") as HTMLElement
    );
    expect(mocks.remove).toHaveBeenCalledWith("course");
    expect(button("Koleksiyona ekle: Emsile’nin altı bâbı")).toBeTruthy();
  });

  it("undoes the change and says so in a toast when the API refuses", async () => {
    mocks.add.mockResolvedValue({ success: false, error: "no" });
    await mount();
    await click(
      button("Koleksiyona ekle: Sarfın temel kelimeleri") as HTMLElement
    );
    expect(button("Koleksiyona ekle: Sarfın temel kelimeleri")).toBeTruthy();
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "error", title: "Deste eklenemedi" })
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("the card-type chips write the choice into the address", async () => {
    await mount();
    const chips = [
      ...document.querySelectorAll<HTMLButtonElement>(".mds-chip"),
    ];
    expect(chips.map((c) => c.textContent)).toEqual([
      "Tümü",
      "Kelime",
      "Hadis",
    ]);
    await click(chips[2]);
    expect(mocks.push).toHaveBeenLastCalledWith(
      "/tr/decks/explore?type=HADEETH"
    );
    await click(chips[1]);
    expect(mocks.push).toHaveBeenLastCalledWith(
      "/tr/decks/explore?type=VOCABULARY"
    );
  });

  it("marks the chip the address carries, and 'Tümü' clears it", async () => {
    await mount({ cardType: "HADEETH" });
    const chips = [
      ...document.querySelectorAll<HTMLButtonElement>(".mds-chip"),
    ];
    expect(chips[2].getAttribute("aria-pressed")).toBe("true");
    await click(chips[0]);
    expect(mocks.push).toHaveBeenLastCalledWith("/tr/decks/explore");
  });

  it("says what is empty and asks again when the server could not read the decks", async () => {
    await mount({ data: { courseDecks: [], publicDecks: [] } });
    expect(section("Derslerinin desteleri").textContent).toContain(
      "Kayıtlı olduğun derslerin desteleri burada görünür."
    );
    expect(section("Herkese açık desteler").textContent).toContain(
      "Henüz herkese açık deste yok."
    );
    expect(section("Derslerinin desteleri").textContent).toContain("0 deste");
    await cleanup();
    await mount({ data: null });
    expect(document.body.textContent).toContain("Desteler yüklenemedi");
  });
});
