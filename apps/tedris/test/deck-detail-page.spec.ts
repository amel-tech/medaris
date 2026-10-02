// @vitest-environment happy-dom
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cardRow, deckResponse, summary } from "./decks-harness";
import { cleanup, click, render, settle } from "./dom";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  request: vi.fn(),
  withdraw: vi.fn(),
  del: vi.fn(),
  update: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  copy: vi.fn(),
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
    push: mocks.push,
    replace: mocks.replace,
    refresh: mocks.refresh,
  }),
}));
vi.mock("~/features/flashcards/actions", () => ({
  requestDeckPublication: mocks.request,
  withdrawDeckPublication: mocks.withdraw,
  deleteDeck: mocks.del,
  updateDeck: mocks.update,
  addDeckToCollection: mocks.add,
  removeDeckFromCollection: mocks.remove,
  copyCard: mocks.copy,
}));
vi.mock("@medaris/ui/mds/toast", () => ({
  useToaster: () => ({ notify: mocks.notify, dismiss: () => {} }),
}));

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});
afterEach(cleanup);

type Props = Parameters<
  typeof import("~/features/flashcards/components/deck-detail-page").DeckDetailPage
>[0];
const mount = async (over: Partial<Props> = {}) => {
  const { DeckDetailPage } = await import(
    "~/features/flashcards/components/deck-detail-page"
  );
  return render(
    createElement(DeckDetailPage, {
      deck: deckResponse(),
      cards: [],
      isOwner: true,
      inCollection: false,
      ownDecks: [],
      ...over,
    })
  );
};

const eighteen = [
  ...Array.from({ length: 6 }, (_, i) => cardRow(i + 1, "MASTERED")),
  ...Array.from({ length: 7 }, (_, i) => cardRow(i + 7, "LEARNING")),
  ...Array.from({ length: 5 }, (_, i) => cardRow(i + 14)),
];
const byText = (selector: string, text: string) =>
  [...document.querySelectorAll<HTMLElement>(selector)].find(
    (n) => n.textContent === text
  ) as HTMLElement;
const button = (text: string) => byText("button", text);
const dialogs = () => document.querySelectorAll('[role="dialog"]');

describe("Deste ayrıntısı, sahibi (design tedris/28)", () => {
  it("opens with the name, the status, the meta line, the description and the tabs", async () => {
    await mount({
      deck: deckResponse({
        publishStatus: "PENDING",
        publishRequestedAt: new Date("2026-09-29T18:10:00Z"),
      }),
      cards: eighteen,
    });
    expect(document.querySelector("h1")?.textContent).toBe("Mehmûz fiiller");
    const header = document.querySelector("header") as HTMLElement;
    expect(header.textContent).toContain("Yayın isteği bekliyor");
    expect(header.textContent).toContain("18 ezber kartı·Kelime·Senin desten");
    expect(header.textContent).toContain(
      "Hemzeli fiillerin çekimleri ve emir sîgaları."
    );
    const tabs = [...header.querySelectorAll(".mds-tab")];
    expect(tabs.map((t) => t.textContent)).toEqual(["Genel", "Kartlar18"]);
    expect(tabs[0].getAttribute("href")).toBe("/decks/d1");
    expect(tabs[0].getAttribute("aria-current")).toBe("page");
    expect(tabs[1].getAttribute("href")).toBe("/decks/d1/cards");
    const study = [...header.querySelectorAll("a")].find(
      (a) => a.textContent === "Çalış"
    );
    expect(study?.getAttribute("href")).toBe("/decks/study/d1");
  });

  it("counts the cards by their progress: new + learning + mastered is the deck", async () => {
    await mount({ cards: eighteen });
    const text = document.body.textContent as string;
    expect(text).toContain("Tamamlanan: 6 / 18 kart");
    expect(text).toContain("%33");
    expect(text).toContain("Yeni5 kart");
    expect(text).toContain("Öğreniliyor7 kart");
    expect(text).toContain("Tamamlandı6 kart");
    expect(text).toContain("Bugün 7 kart tekrar bekliyor.");
  });

  it("shows the first six cards, Arabic fronts right to left, with their status", async () => {
    await mount({ cards: eighteen });
    const samples = [
      ...document.querySelectorAll(
        'section[aria-labelledby="deck-samples"] ul > li'
      ),
    ];
    expect(samples).toHaveLength(6);
    expect(samples[0].textContent).toContain("Kart 1");
    expect(samples[0].textContent).toContain("Tamamlandı");
    expect(samples[0].querySelector('[lang="ar"]')?.getAttribute("dir")).toBe(
      "rtl"
    );
    expect(samples[0].textContent).toContain("Aldı 1");
    const all = byText("a", "Bütün kartlar");
    expect(all.getAttribute("href")).toBe("/decks/d1/cards");
  });

  it("an empty deck offers 'Kart ekle' instead of cards", async () => {
    await mount({ cards: [] });
    expect(document.body.textContent).toContain("Bu destede henüz kart yok.");
    expect(byText("a", "Kart ekle").getAttribute("href")).toBe(
      "/decks/d1/cards"
    );
    expect(document.body.textContent).not.toContain("tekrar bekliyor");
  });

  it("says who can see the deck in each state, with the request's date", async () => {
    await mount({
      deck: deckResponse({
        publishStatus: "PENDING",
        publishRequestedAt: new Date("2026-09-29T18:10:00Z"),
      }),
    });
    expect(document.body.textContent).toContain(
      "Yayın isteğini 29 Eylül 2026 Salı 21:10’da gönderdin. Medaris yönetimi inceleyip yayımlayana dek deste özel kalır."
    );
    expect(button("İsteği geri çek")).toBeTruthy();
    await cleanup();
    await mount({
      deck: deckResponse({ publishStatus: "PUBLISHED", isPublic: true }),
    });
    expect(document.body.textContent).toContain("Bu deste herkese açık");
    expect(button("Özele çek")).toBeTruthy();
    await cleanup();
    await mount();
    expect(document.body.textContent).toContain(
      "Bu deste özel; yalnız sen görürsün."
    );
    expect(button("Yayın iste")).toBeTruthy();
  });

  it("'Yayın iste' and 'İsteği geri çek' call the API, answer in a toast and refresh", async () => {
    mocks.request.mockResolvedValue({ success: true, data: {} });
    mocks.withdraw.mockResolvedValue({ success: true, data: {} });
    await mount();
    await click(button("Yayın iste"));
    expect(mocks.request).toHaveBeenCalledWith("d1");
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: "success",
        title: "Yayın isteği gönderildi",
      })
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    await cleanup();

    await mount({ deck: deckResponse({ publishStatus: "PENDING" }) });
    await click(button("İsteği geri çek"));
    expect(mocks.withdraw).toHaveBeenCalledWith("d1");
    expect(mocks.notify).toHaveBeenLastCalledWith(
      expect.objectContaining({ tone: "success", title: "Deste özel oldu" })
    );
  });

  it("a refused request is a toast and no refresh", async () => {
    mocks.withdraw.mockResolvedValue({ success: false, error: "no" });
    await mount({ deck: deckResponse({ publishStatus: "PENDING" }) });
    await click(button("İsteği geri çek"));
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "error", title: "İstek geri çekilemedi" })
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("'Desteyi sil' asks first: 'Vazgeç' keeps the deck, the confirmation deletes it and goes back to Desteler", async () => {
    mocks.del.mockResolvedValue({ success: true, data: true });
    await mount({ cards: eighteen });
    await click(button("Desteyi sil"));
    const confirm = document.querySelector(
      '[role="alertdialog"]'
    ) as HTMLElement;
    expect(confirm).toBeTruthy();
    expect(confirm.textContent).toContain(
      "“Mehmûz fiiller” destesi ve içindeki 18 kart silinecek. Bu işlem geri alınamaz."
    );
    expect(mocks.del).not.toHaveBeenCalled();
    await click(
      [...confirm.querySelectorAll("button")].find(
        (b) => b.textContent === "Vazgeç"
      ) as HTMLElement
    );
    await settle();
    expect(mocks.del).not.toHaveBeenCalled();

    await click(button("Desteyi sil"));
    const again = document.querySelector('[role="alertdialog"]') as HTMLElement;
    await click(
      [...again.querySelectorAll("button")].find(
        (b) => b.textContent === "Desteyi sil"
      ) as HTMLElement
    );
    expect(mocks.del).toHaveBeenCalledWith("d1");
    expect(mocks.push).toHaveBeenCalledWith("/decks");
  });

  it("a refused delete leaves the deck and says so", async () => {
    mocks.del.mockResolvedValue({ success: false, error: "no" });
    await mount();
    await click(button("Desteyi sil"));
    const confirm = document.querySelector(
      '[role="alertdialog"]'
    ) as HTMLElement;
    await click(
      [...confirm.querySelectorAll("button")].find(
        (b) => b.textContent === "Desteyi sil"
      ) as HTMLElement
    );
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "error", title: "Silinemedi" })
    );
  });
});

describe("Desteyi düzenle (design tedris/33)", () => {
  const open = async (over: Partial<Props["deck"]> = {}) => {
    await mount({ deck: deckResponse(over), editing: true });
    await settle();
  };
  const field = (name: string) =>
    document.querySelector(
      `[role="dialog"] [name="${name}"]`
    ) as HTMLInputElement;
  const type = async (el: HTMLInputElement, value: string) => {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const save = async () => {
    await click(
      [...document.querySelectorAll('[role="dialog"] button')].find(
        (b) => b.textContent === "Kaydet"
      ) as HTMLElement
    );
    await settle();
  };

  it("opens filled with the name and the description", async () => {
    await open();
    expect(dialogs()).toHaveLength(1);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "Desteyi düzenle"
    );
    expect(field("title").value).toBe("Mehmûz fiiller");
    expect(field("description").value).toBe(
      "Hemzeli fiillerin çekimleri ve emir sîgaları."
    );
    // Nothing about a request when there is none.
    expect(document.body.textContent).not.toContain("Yayın isteğin bekliyor");
  });

  it("says a waiting request survives the edit", async () => {
    await open({ publishStatus: "PENDING" });
    const text = document.querySelector('[role="dialog"]')?.textContent;
    expect(text).toContain("Yayın isteğin bekliyor");
    expect(text).toContain(
      "Değişiklik isteği bozmaz; Medaris yönetimi isteği son hâliyle inceler."
    );
  });

  it("an empty name is refused and nothing is sent", async () => {
    await open();
    await type(field("title"), "  ");
    await save();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "Bir deste adı yaz."
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("saves the new name, says so, and goes back to the deck's page", async () => {
    mocks.update.mockResolvedValue({ success: true, data: {} });
    await open();
    await type(field("title"), "Mehmûz fiiller II");
    await save();
    expect(mocks.update).toHaveBeenCalledWith("d1", {
      title: "Mehmûz fiiller II",
      description: "Hemzeli fiillerin çekimleri ve emir sîgaları.",
    });
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "success", title: "Deste güncellendi" })
    );
    expect(mocks.replace).toHaveBeenCalledWith("/decks/d1");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("sends nothing when nothing changed, and keeps the dialog's content when the API refuses", async () => {
    await open();
    await save();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledWith("/decks/d1");

    mocks.update.mockResolvedValue({ success: false, error: "no" });
    await type(field("title"), "Başka ad olsun");
    await save();
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "error", title: "Kaydedilemedi" })
    );
    expect(field("title").value).toBe("Başka ad olsun");
  });

  it("'Vazgeç' goes back to the page without a request", async () => {
    await open();
    await click(
      [...document.querySelectorAll('[role="dialog"] button')].find(
        (b) => b.textContent === "Vazgeç"
      ) as HTMLElement
    );
    await settle();
    expect(mocks.replace).toHaveBeenCalledWith("/decks/d1");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("Deste, okuyan kişinin görünümü (design tedris/31)", () => {
  const hadith = (n: number, over = {}) =>
    cardRow(n, n <= 2 ? "MASTERED" : undefined, {
      type: "HADEETH",
      contentFront: `إِنَّمَا الْأَعْمَالُ ${n}`,
      contentBack: `Ameller ${n}`,
      contentMeta: { source: "Buhârî, Müslim" },
      ...over,
    });
  const eight = Array.from({ length: 8 }, (_, i) => hadith(i + 1));
  const reader = (over: Partial<Props> = {}) =>
    mount({
      deck: deckResponse({
        title: "Kırk hadis",
        authorId: "other",
        isPublic: true,
        publishStatus: "PUBLISHED",
        cardType: "HADEETH",
      }),
      cards: eight,
      isOwner: false,
      inCollection: true,
      ...over,
    });
  const rows = () => document.querySelectorAll("tbody tr");

  it("has no way to change the deck: no edit, no delete, no card form, no publication", async () => {
    await reader();
    for (const label of [
      "Düzenle",
      "Desteyi sil",
      "Kart ekle",
      "İsteği geri çek",
      "Yayın iste",
      "Dışa aktar",
      "İçe aktar",
    ]) {
      expect(byText("button", label), label).toBeUndefined();
      expect(byText("a", label), label).toBeUndefined();
    }
    expect(document.querySelectorAll(".mds-tab")).toHaveLength(0);
  });

  it("names the deck, its badges, its size and kind, and says it cannot be changed", async () => {
    await reader();
    const header = document.querySelector("header") as HTMLElement;
    expect(header.querySelector("h1")?.textContent).toBe("Kırk hadis");
    expect(header.textContent).toContain("Herkese açık");
    expect(header.textContent).toContain("Koleksiyonunda");
    expect(header.textContent).toContain("8 ezber kartı·Hadis");
    expect(document.body.textContent).toContain(
      "Bu destenin kartlarını değiştiremezsin; beğendiğin kartı kendi destene kopyalayabilirsin."
    );
    expect(document.body.textContent).toContain("Tamamlanan: 2 / 8 kart");
    expect(document.body.textContent).toContain("%25");
    expect(document.body.textContent).toContain(
      "Bu deste herkese açık: Medaris yönetimi inceleyip yayımladı."
    );
  });

  it("shows six cards with their source, six more on 'Daha fazla göster', and the count follows", async () => {
    await reader();
    expect(rows()).toHaveLength(6);
    expect(rows()[0].textContent).toContain("Buhârî, Müslim");
    expect(document.body.textContent).toContain("8 karttan 6’sı gösteriliyor");
    await click(button("Daha fazla göster"));
    expect(rows()).toHaveLength(8);
    expect(document.body.textContent).toContain("8 karttan 8’i gösteriliyor");
    expect(button("Daha fazla göster")).toBeUndefined();
  });

  it("a deck that is not in the collection offers 'Koleksiyona ekle'; the badge follows the choice", async () => {
    mocks.add.mockResolvedValue({ success: true, data: true });
    mocks.remove.mockResolvedValue({ success: true, data: true });
    await reader({ inCollection: false });
    expect(document.querySelector("header")?.textContent).not.toContain(
      "Koleksiyonunda"
    );
    await click(button("Koleksiyona ekle"));
    expect(mocks.add).toHaveBeenCalledWith("d1");
    expect(document.querySelector("header")?.textContent).toContain(
      "Koleksiyonunda"
    );
    await click(button("Koleksiyondan çıkar"));
    expect(mocks.remove).toHaveBeenCalledWith("d1");
    expect(document.querySelector("header")?.textContent).not.toContain(
      "Koleksiyonunda"
    );
  });

  it("undoes the collection change when the API refuses", async () => {
    mocks.remove.mockResolvedValue({ success: false, error: "no" });
    await reader();
    await click(button("Koleksiyondan çıkar"));
    expect(document.querySelector("header")?.textContent).toContain(
      "Koleksiyonunda"
    );
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "error", title: "Deste çıkarılamadı" })
    );
  });

  describe("'Kendi desteme kopyala'", () => {
    const own = [
      summary({ id: "h1", title: "Hadislerim", cardType: "HADEETH" }),
      summary({ id: "v1", title: "Kelimelerim", cardType: "VOCABULARY" }),
    ];
    const copyButton = (n: number) =>
      document.querySelector(
        `button[aria-label="Kendi desteme kopyala: kart ${n}"]`
      ) as HTMLElement;
    const dialogButton = (text: string) =>
      [...document.querySelectorAll('[role="dialog"] button')].find(
        (b) => b.textContent === text
      ) as HTMLElement;

    it("offers only the caller's own decks of the same kind, and chooses none for them", async () => {
      await reader({ ownDecks: own });
      await click(copyButton(1));
      const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog.textContent).toContain("Kendi desteme kopyala");
      const options = [...dialog.querySelectorAll('[role="radio"]')].map(
        (r) => r.closest("label")?.textContent
      );
      expect(options).toEqual(["Hadislerim"]);
      expect(dialog.querySelectorAll('[aria-checked="true"]')).toHaveLength(0);
      await click(dialogButton("Kopyala"));
      expect(dialog.textContent).toContain("Bir hedef deste seç.");
      expect(mocks.copy).not.toHaveBeenCalled();
    });

    it("copies the card as it is into the chosen deck and says so", async () => {
      mocks.copy.mockResolvedValue({ success: true, data: {} });
      await reader({ ownDecks: own });
      await click(copyButton(2));
      await click(
        document.querySelector('[role="dialog"] [role="radio"]') as HTMLElement
      );
      await click(dialogButton("Kopyala"));
      expect(mocks.copy).toHaveBeenCalledWith("h1", {
        type: "HADEETH",
        contentFront: "إِنَّمَا الْأَعْمَالُ 2",
        contentBack: "Ameller 2",
        contentMeta: { source: "Buhârî, Müslim" },
      });
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: "success",
          title: "Kart destene kopyalandı",
          description: "“Hadislerim” destesine eklendi.",
        })
      );
      expect(mocks.refresh).toHaveBeenCalled();
    });

    it("without an own deck of that kind it says to create one", async () => {
      await reader({ ownDecks: [own[1]] });
      await click(copyButton(1));
      const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog.textContent).toContain(
        "Bu türde kendi destein yok. Kartı kopyalamak için önce bir deste oluştur."
      );
      const create = [...dialog.querySelectorAll("a")].find(
        (a) => a.textContent === "Deste oluştur"
      );
      expect(create?.getAttribute("href")).toBe("/decks/create");
      expect(dialog.querySelector('[role="radio"]')).toBeNull();
    });

    it("a refused copy is a toast and the dialog stays", async () => {
      mocks.copy.mockResolvedValue({ success: false, error: "no" });
      await reader({ ownDecks: own });
      await click(copyButton(1));
      await click(
        document.querySelector('[role="dialog"] [role="radio"]') as HTMLElement
      );
      await click(dialogButton("Kopyala"));
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({ tone: "error", title: "Kart kopyalanamadı" })
      );
      expect(dialogs()).toHaveLength(1);
    });
  });
});
