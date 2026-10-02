// @vitest-environment happy-dom
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cardRow, deckResponse } from "./decks-harness";
import { cleanup, click, render, settle } from "./dom";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
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
  useRouter: () => ({
    refresh: mocks.refresh,
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));
vi.mock("~/features/flashcards/actions", () => ({
  createCard: mocks.create,
  updateCard: mocks.update,
  deleteCard: mocks.del,
}));
vi.mock("@medaris/ui/mds/toast", () => ({
  useToaster: () => ({ notify: mocks.notify, dismiss: () => {} }),
}));

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});
afterEach(cleanup);

const cards = [
  cardRow(1, "MASTERED"),
  cardRow(2, "LEARNING"),
  cardRow(3),
  cardRow(4, "MASTERED", { contentFront: "Latin front" }),
];
const mount = async (rows = cards, deck = deckResponse()) => {
  const { DeckCardsPage } = await import(
    "~/features/flashcards/components/deck-cards-page"
  );
  return render(createElement(DeckCardsPage, { deck, cards: rows }));
};
const button = (text: string, root: ParentNode = document) =>
  [...root.querySelectorAll<HTMLElement>("button")].find(
    (b) => b.textContent === text
  ) as HTMLElement;
const labelled = (label: string) =>
  document.querySelector(`button[aria-label="${label}"]`) as HTMLElement;
const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement;
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

describe("Deste kartları (design tedris/29)", () => {
  it("lists every card with its two faces and the caller's own status", async () => {
    await mount();
    expect(document.querySelector("table caption")?.textContent).toBe(
      "Mehmûz fiiller destesinin kartları"
    );
    const rows = [...document.querySelectorAll("tbody tr")];
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.querySelector(".mds-badge")?.textContent)).toEqual(
      ["Tamamlandı", "Öğreniliyor", "Yeni", "Tamamlandı"]
    );
    expect(rows[0].textContent).toContain("Aldı 1");
    // An Arabic front sets right to left; a Latin one follows its own direction.
    expect(rows[0].querySelector('[lang="ar"]')?.getAttribute("dir")).toBe(
      "rtl"
    );
    expect(rows[3].querySelector('[lang="ar"]')).toBeNull();
    expect(document.body.textContent).toContain(
      "Durum sütunu senin çalışma ilerlemeni gösterir. Kartları yalnız sen ekler, düzenler ve silersin."
    );
  });

  it("the header carries the three actions and the tab count follows the cards", async () => {
    await mount();
    const header = document.querySelector("header") as HTMLElement;
    const download = [...header.querySelectorAll("a")].find(
      (a) => a.textContent === "Dışa aktar"
    );
    expect(download?.getAttribute("href")).toBe(
      "/api/decks/d1/export?format=xlsx"
    );
    expect(button("İçe aktar", header)).toBeTruthy();
    expect(button("Kart ekle", header)).toBeTruthy();
    expect(
      header.querySelector('.mds-tab[aria-current="page"]')?.textContent
    ).toBe("Kartlar4");
  });

  it("every row names its card in the Düzenle and Sil buttons", async () => {
    await mount();
    expect(labelled("Düzenle: kart 1")).toBeTruthy();
    expect(labelled("Sil: kart 4")).toBeTruthy();
  });

  it("an empty deck says so and offers 'Kart ekle'", async () => {
    await mount([]);
    expect(document.body.textContent).toContain("Bu destede henüz kart yok.");
    expect(document.querySelector("table")).toBeNull();
    expect(
      button("Kart ekle", document.querySelector(".mds-empty") as HTMLElement)
    ).toBeTruthy();
  });

  describe("Kart ekle", () => {
    const open = async () => {
      await mount();
      await click(
        button("Kart ekle", document.querySelector("header") as HTMLElement)
      );
      await settle();
    };
    const save = async () => {
      await click(button("Kaydet", dialog()));
      await settle();
    };

    it("refuses empty or very short faces and sends nothing", async () => {
      await open();
      await save();
      expect(dialog().textContent?.match(/Bu alan boş olamaz\./g)).toHaveLength(
        2
      );
      await type(
        dialog().querySelector('[name="contentFront"]') as HTMLInputElement,
        "ab"
      );
      await type(
        dialog().querySelector('[name="contentBack"]') as HTMLInputElement,
        "cevap"
      );
      await save();
      expect(dialog().textContent).toContain("En az 3 karakter yaz.");
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("adds the card with the deck's kind, says so, and refreshes", async () => {
      mocks.create.mockResolvedValue({ success: true, data: {} });
      await open();
      await type(
        dialog().querySelector('[name="contentFront"]') as HTMLInputElement,
        "قَرَأَ"
      );
      await type(
        dialog().querySelector('[name="contentBack"]') as HTMLInputElement,
        "Okudu"
      );
      await save();
      expect(mocks.create).toHaveBeenCalledWith("d1", "VOCABULARY", {
        contentFront: "قَرَأَ",
        contentBack: "Okudu",
      });
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({ tone: "success", title: "Kart eklendi" })
      );
      expect(mocks.refresh).toHaveBeenCalled();
      await settle();
      expect(dialog()).toBeNull();
    });

    it("keeps the typed faces and says so when the API refuses", async () => {
      mocks.create.mockResolvedValue({ success: false, error: "no" });
      await open();
      await type(
        dialog().querySelector('[name="contentFront"]') as HTMLInputElement,
        "قَرَأَ"
      );
      await type(
        dialog().querySelector('[name="contentBack"]') as HTMLInputElement,
        "Okudu"
      );
      await save();
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({ tone: "error", title: "Kaydedilemedi" })
      );
      expect(
        (dialog().querySelector('[name="contentBack"]') as HTMLInputElement)
          .value
      ).toBe("Okudu");
    });

    it("a hadith deck helps with its own words", async () => {
      await mount(cards, deckResponse({ cardType: "HADEETH" }));
      await click(
        button("Kart ekle", document.querySelector("header") as HTMLElement)
      );
      await settle();
      expect(dialog().textContent).toContain("Hadisten bir parça.");
      expect(dialog().textContent).toContain("Tam metni ve kaynağı.");
    });
  });

  describe("Düzenle", () => {
    it("opens the card's own faces and saves a change to them", async () => {
      mocks.update.mockResolvedValue({ success: true, data: {} });
      await mount();
      await click(labelled("Düzenle: kart 2"));
      await settle();
      expect(dialog().textContent).toContain("Kartı düzenle");
      expect(
        (dialog().querySelector('[name="contentBack"]') as HTMLInputElement)
          .value
      ).toBe("Aldı 2");
      await type(
        dialog().querySelector('[name="contentBack"]') as HTMLInputElement,
        "Aldı, alır"
      );
      await click(button("Kaydet", dialog()));
      await settle();
      expect(mocks.update).toHaveBeenCalledWith("c2", {
        contentFront: "أَخَذَ 2",
        contentBack: "Aldı, alır",
      });
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Kart güncellendi" })
      );
    });
  });

  describe("Sil", () => {
    const confirm = () =>
      document.querySelector('[role="alertdialog"]') as HTMLElement;

    it("deletes only after the answer: 'Vazgeç' keeps the card", async () => {
      mocks.del.mockResolvedValue({ success: true, data: true });
      await mount();
      await click(labelled("Sil: kart 3"));
      await settle();
      expect(confirm().textContent).toContain("Kartı sil?");
      expect(confirm().textContent).toContain("Kart 3");
      expect(mocks.del).not.toHaveBeenCalled();
      await click(button("Vazgeç", confirm()));
      await settle();
      expect(mocks.del).not.toHaveBeenCalled();
      expect(confirm()).toBeNull();

      await click(labelled("Sil: kart 3"));
      await settle();
      await click(button("Kartı sil", confirm()));
      await settle();
      expect(mocks.del).toHaveBeenCalledWith("c3");
      expect(mocks.refresh).toHaveBeenCalled();
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({ tone: "success", title: "Kart silindi" })
      );
    });

    it("a refused delete leaves the card and says so", async () => {
      mocks.del.mockResolvedValue({ success: false, error: "no" });
      await mount();
      await click(labelled("Sil: kart 1"));
      await settle();
      await click(button("Kartı sil", confirm()));
      await settle();
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({ tone: "error", title: "Silinemedi" })
      );
      expect(mocks.refresh).not.toHaveBeenCalled();
    });
  });

  describe("İçe aktar", () => {
    const fetchMock = vi.fn();
    beforeEach(() => {
      fetchMock.mockReset();
      vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => vi.unstubAllGlobals());

    const open = async () => {
      await mount();
      await click(
        button("İçe aktar", document.querySelector("header") as HTMLElement)
      );
      await settle();
    };
    const choose = async (name = "kartlar.csv") => {
      const input = dialog().querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      const file = new File(["Card Type,Content Front,Content Back\n"], name, {
        type: "text/csv",
      });
      await act(async () => {
        Object.defineProperty(input, "files", {
          value: [file],
          configurable: true,
        });
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };

    it("asks for a file first and points at the templates", async () => {
      await open();
      await click(button("İçe aktar", dialog()));
      expect(dialog().textContent).toContain("Bir dosya seç.");
      expect(fetchMock).not.toHaveBeenCalled();
      const links = [...dialog().querySelectorAll("a")].map((a) =>
        a.getAttribute("href")
      );
      expect(links).toEqual([
        "/api/decks/sample?format=xlsx",
        "/api/decks/sample?format=csv",
      ]);
    });

    it("posts the file to the app's own route and reports how many cards were added", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ count: 3 }),
      });
      await open();
      await choose();
      await click(button("İçe aktar", dialog()));
      await settle();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/decks/d1/import",
        expect.objectContaining({ method: "POST" })
      );
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: "success",
          title: "Kartlar içe aktarıldı",
          description: "3 kart eklendi.",
        })
      );
      expect(mocks.refresh).toHaveBeenCalled();
    });

    it("lists the bad rows of a refused file and adds nothing", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          context: {
            errors: [
              {
                row: 2,
                errors: [{ field: "type", message: "type must be valid" }],
              },
            ],
          },
        }),
      });
      await open();
      await choose();
      await click(button("İçe aktar", dialog()));
      await settle();
      expect(dialog().textContent).toContain(
        "1 satırda sorun var; hiçbir kart eklenmedi."
      );
      expect(dialog().textContent).toContain("Satır 2: type must be valid");
      expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it("says the file could not be imported when the answer is anything else", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });
      await open();
      await choose();
      await click(button("İçe aktar", dialog()));
      await settle();
      expect(dialog().textContent).toContain("Dosya içe aktarılamadı");
      fetchMock.mockRejectedValue(new Error("network"));
      await click(button("İçe aktar", dialog()));
      await settle();
      expect(dialog().textContent).toContain("Dosya içe aktarılamadı");
    });
  });
});
