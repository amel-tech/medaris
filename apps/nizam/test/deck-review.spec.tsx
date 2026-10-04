import { resources } from "@medaris/i18n";
import type {
  DeckProposalResponse,
  DeckPublishRequestListResponse,
  ManagedKoskDecksResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DeckRequestsView } from "~/features/deck-review/components/deck-requests-view";
import { KoskDeckForm } from "~/features/deck-review/components/kosk-deck-form";
import { KoskDecksView } from "~/features/deck-review/components/kosk-decks-view";
import { RejectDialog } from "~/features/deck-review/components/reject-dialog";
import {
  canUnpublish,
  countsAfterLeaving,
  countsAfterUnpublish,
  deckErrorKey,
  deckFailureKey,
  deckPayload,
  emptyDeckForm,
  formFromProposal,
  isBlank,
  isGone,
  mergeById,
  newDeckHref,
  nextPage,
  previewKey,
  shortDate,
  shortDateTime,
  validateDeckForm,
} from "~/features/deck-review/present";

// The server actions reach for the session and the API; none runs in a render.
vi.mock("~/features/deck-review/actions", () => ({
  loadDeckRequests: vi.fn(),
  loadRequestCards: vi.fn(),
  approveDeckRequest: vi.fn(),
  rejectDeckRequest: vi.fn(),
  rejectDeckProposal: vi.fn(),
  openKoskDeck: vi.fn(),
  hideKoskDeck: vi.fn(),
  unpublishDeck: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const render = (ui: React.ReactElement, locale: "tr" | "en" | "ar" = "tr") =>
  renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      timeZone="Europe/Istanbul"
      messages={{ nizam: resources[locale].nizam } as never}
    >
      {ui}
    </NextIntlClientProvider>
  );

const OPTS = { locale: "tr", timeZone: "Europe/Istanbul" };

const proposal = (
  over: Partial<DeckProposalResponse> = {}
): DeckProposalResponse => ({
  id: "p1",
  title: "İ’lâl kaideleri",
  description: "Tek bir köşk destesi iki derse yeter.",
  cardType: "VOCABULARY",
  proposedBy: { id: "m1", name: "Ayşe Nur Kılıçarslan" },
  courseTitle: "Avâmil ve Tasrîf",
  createdAt: new Date("2026-09-29T09:00:00Z"),
  ...over,
});

describe("the deck form's rules (nizam 35)", () => {
  it("needs a name and nothing else", () => {
    expect(validateDeckForm(emptyDeckForm())).toBe("titleRequired");
    expect(validateDeckForm({ ...emptyDeckForm(), title: "   " })).toBe(
      "titleRequired"
    );
    expect(validateDeckForm({ ...emptyDeckForm(), title: "Sarf" })).toBeNull();
    expect(isBlank(" \n ")).toBe(true);
  });

  it("opens filled in from a proposal", () => {
    expect(formFromProposal(proposal({ cardType: "HADEETH" }))).toEqual({
      title: "İ’lâl kaideleri",
      description: "Tek bir köşk destesi iki derse yeter.",
      cardType: "HADEETH",
    });
    expect(formFromProposal(proposal({ description: null })).description).toBe(
      ""
    );
  });

  it("sends the trimmed name, leaves a blank description out and carries the proposal", () => {
    expect(
      deckPayload(
        { title: " Sarf ", description: "  ", cardType: "HADEETH" },
        "p1"
      )
    ).toEqual({
      title: "Sarf",
      description: undefined,
      cardType: "HADEETH",
      proposalId: "p1",
    });
  });

  it("maps the card type to its preview and the proposal to its link", () => {
    expect(previewKey("VOCABULARY")).toBe("vocabulary");
    expect(previewKey("HADEETH")).toBe("hadith");
    expect(newDeckHref("k1")).toBe("/kosks/k1/desteler/yeni");
    expect(newDeckHref("k1", "p1")).toBe("/kosks/k1/desteler/yeni?oneri=p1");
  });
});

describe("answers and dates", () => {
  it("knows the codes tedrisat answers with, and which ones mean the row is gone", () => {
    expect(deckErrorKey({ code: "DECK_REQUEST_NOT_PENDING" })).toBe(
      "errors.requestAnswered"
    );
    expect(deckErrorKey({ code: "NOPE" })).toBeNull();
    expect(deckErrorKey(undefined)).toBeNull();
    expect(deckFailureKey(undefined)).toBe("errors.generic");
    expect(deckFailureKey({ code: "NOPE" })).toBe("errors.generic");
    expect(deckFailureKey({ code: "KOSK_DECK_NOT_FOUND" })).toBe(
      "errors.deckGone"
    );
    expect(isGone({ code: "DECK_PROPOSAL_NOT_PENDING" })).toBe(true);
    expect(isGone({ code: "DECK_REVIEW_FORBIDDEN" })).toBe(false);
  });

  // MDRS-148: a deck taken back (or never published) answers 409, and the row
  // that was offered for unpublishing is stale.
  it("knows DECK_NOT_PUBLISHED: its own sentence, and the row is gone", () => {
    expect(deckErrorKey({ code: "DECK_NOT_PUBLISHED" })).toBe(
      "errors.notPublished"
    );
    expect(isGone({ code: "DECK_NOT_PUBLISHED" })).toBe(true);
  });

  it("writes a day and minute in the viewer's zone", () => {
    expect(shortDateTime("2026-09-29T18:10:00Z", OPTS)).toBe("29 Eyl 21:10");
    expect(shortDate("2026-09-29T18:10:00Z", OPTS)).toBe("29 Eyl");
  });
});

describe("paging and the tab counts", () => {
  it("asks for the first page that holds a row not loaded yet", () => {
    expect(nextPage(0)).toBe(1);
    expect(nextPage(11)).toBe(1);
    expect(nextPage(12)).toBe(2);
    expect(nextPage(23)).toBe(2);
    expect(nextPage(24)).toBe(3);
    expect(nextPage(50, 50)).toBe(2);
  });

  it("adds the page behind the rows shown and keeps a row that is on both once", () => {
    const row = (id: string) => ({ id });
    expect(
      mergeById([row("a"), row("b")], [row("b"), row("c"), row("d")])
    ).toEqual([row("a"), row("b"), row("c"), row("d")]);
    expect(mergeById([], [row("a")])).toEqual([row("a")]);
  });

  it("counts a request this screen answered as answered, and one that is gone as neither", () => {
    expect(countsAfterLeaving({ pending: 3, decided: 7 }, true)).toEqual({
      pending: 2,
      decided: 8,
    });
    expect(countsAfterLeaving({ pending: 3, decided: 7 }, false)).toEqual({
      pending: 2,
      decided: 7,
    });
    expect(countsAfterLeaving({ pending: 0, decided: 7 }, false)).toEqual({
      pending: 0,
      decided: 7,
    });
  });
});

describe("taking a published deck back (MDRS-148)", () => {
  it("is for the başnazım on a published deck, and nobody and nothing else", () => {
    expect(canUnpublish("PUBLISHED", true)).toBe(true);
    expect(canUnpublish("PUBLISHED", false)).toBe(false);
    expect(canUnpublish("PENDING", true)).toBe(false);
    expect(canUnpublish("REJECTED", true)).toBe(false);
  });

  it("takes the deck out of the answered count and never below zero", () => {
    expect(countsAfterUnpublish({ pending: 2, decided: 7 })).toEqual({
      pending: 2,
      decided: 6,
    });
    expect(countsAfterUnpublish({ pending: 0, decided: 0 })).toEqual({
      pending: 0,
      decided: 0,
    });
  });
});

describe("DeckRequestsView (nizam 16)", () => {
  const list: DeckPublishRequestListResponse = {
    pendingCount: 2,
    decidedCount: 7,
    items: [
      {
        id: "d1",
        title: "Mehmûz fiiller",
        description: "Hemzeli fiillerin çekimleri ve emir sîgaları.",
        cardType: "VOCABULARY",
        cardCount: 18,
        owner: { id: "o1", name: "Zeynep Betül Karahanlı" },
        requestedAt: new Date("2026-09-29T18:10:00Z"),
        outcome: "PENDING",
        decidedAt: null,
        rejectReason: null,
      },
      {
        id: "d2",
        title: "Avâmil ezberi",
        description: null,
        cardType: "HADEETH",
        cardCount: 100,
        owner: { id: "o2", name: "Muhammed Said Özdemiroğlu" },
        requestedAt: new Date("2026-09-28T08:05:00Z"),
        outcome: "PENDING",
        decidedAt: null,
        rejectReason: null,
      },
    ],
  };

  it("shows both tab counts, the list and the first request's detail", () => {
    const html = render(<DeckRequestsView initial={list} />);
    expect(html).toContain("Deste yayın istekleri");
    expect(html).toContain("Yayımlanan deste herkese açılır");
    expect(html).toContain("Bekleyen");
    expect(html).toContain("Karara bağlanan");
    expect(html).toContain("Mehmûz fiiller");
    expect(html).toContain("Avâmil ezberi");
    expect(html).toContain("Zeynep Betül Karahanlı");
    expect(html).toContain("18 ezber kartı");
    expect(html).toContain("29 Eyl 21:10");
    expect(html).toContain("Karar bekliyor");
    expect(html).toContain("Örnek kartlar");
    expect(html).toContain("kartlarını görmeniz denetim kaydına yazılır");
    expect(html).toContain("Yayımla");
    expect(html).toContain("Reddet");
  });

  // The answered tab is read after the first render, so the markup is drawn
  // with an answered row selected: the detail is the same one.
  describe("Yayından kaldır", () => {
    const published: DeckPublishRequestListResponse = {
      ...list,
      items: [
        {
          ...list.items[0],
          outcome: "PUBLISHED",
          decidedAt: new Date("2026-09-30T10:00:00Z"),
        },
      ],
    };

    it("is on a published deck for the başnazım, with what it does", () => {
      const html = render(<DeckRequestsView initial={published} isBasnazim />);
      expect(html).toContain('data-testid="unpublish"');
      expect(html).toContain("Yayından kaldır");
      expect(html).toContain("gerekçe sahibine bildirilir");
    });

    it("is not offered to a Medaris nazımı holding the permission", () => {
      const html = render(<DeckRequestsView initial={published} />);
      expect(html).toContain("Yayımlandı");
      expect(html).not.toContain('data-testid="unpublish"');
    });

    it("is not offered on a waiting request", () => {
      const html = render(<DeckRequestsView initial={list} isBasnazim />);
      expect(html).not.toContain('data-testid="unpublish"');
    });
  });

  it("offers Daha fazla göster only while the tab holds more requests than are shown", () => {
    expect(render(<DeckRequestsView initial={list} />)).not.toContain(
      "more-requests"
    );
    const html = render(
      <DeckRequestsView initial={{ ...list, pendingCount: 30 }} />
    );
    expect(html).toContain("more-requests");
    expect(html).toContain("Daha fazla göster");
  });

  it("is an empty state when nothing waits", () => {
    const html = render(
      <DeckRequestsView
        initial={{ items: [], pendingCount: 0, decidedCount: 3 }}
      />
    );
    expect(html).toContain("Karar bekleyen deste yayın isteği yok.");
    expect(html).not.toContain("deck-request-detail");
  });

  it("says so, with a way back, when the first read failed", () => {
    const html = render(<DeckRequestsView initial={null} />);
    expect(html).toContain("İstekler okunamadı");
    expect(html).toContain("Tekrar dene");
  });
});

describe("KoskDecksView (nizam 30)", () => {
  const data: ManagedKoskDecksResponse = {
    decks: [
      {
        id: "d1",
        title: "Sarfın temel kelimeleri",
        description: "الصرف · sarfın temel kelimeleri ve anlamları",
        cardType: "VOCABULARY",
        cardCount: 60,
        updatedAt: new Date("2026-09-28T19:10:00Z"),
      },
    ],
    proposals: [proposal(), proposal({ id: "p2", title: "Ebniye-i seb’a" })],
    decksTotal: 1,
    proposalsTotal: 2,
  };

  it("lists the proposals with their count, and the decks with their actions", () => {
    const html = render(
      <KoskDecksView koskId="k1" koskName="Nûruosmaniye Köşkü" initial={data} />
    );
    expect(html).toContain("Köşk desteleri");
    expect(html).toContain("Köşk destesi aç");
    expect(html).toContain("Müderris önerileri");
    expect(html).toContain("2 öneri kararınızı bekliyor");
    expect(html).toContain("Öneren Ayşe Nur Kılıçarslan");
    expect(html).toContain("Kabul et");
    expect(html).toContain("Reddet");
    expect(html).toContain("Sarfın temel kelimeleri");
    expect(html).toContain("Kartları düzenle");
    expect(html).toContain("Gizle");
    expect(html).toContain("28 Eyl 22:10");
    expect(html).toContain("1 deste");
  });

  it("counts every deck and proposal, not the page, and offers more of each only while some are left", () => {
    expect(
      render(
        <KoskDecksView
          koskId="k1"
          koskName="Nûruosmaniye Köşkü"
          initial={data}
        />
      )
    ).not.toMatch(/more-decks|more-proposals/);
    const html = render(
      <KoskDecksView
        koskId="k1"
        koskName="Nûruosmaniye Köşkü"
        initial={{ ...data, decksTotal: 75, proposalsTotal: 14 }}
      />
    );
    expect(html).toContain("75 deste");
    expect(html).toContain("14 öneri kararınızı bekliyor");
    expect(html).toContain("more-decks");
    expect(html).toContain("more-proposals");
  });

  it("sends Kabul et to the form of that proposal, and Köşk destesi aç to an empty one", () => {
    const html = render(
      <KoskDecksView koskId="k1" koskName="Nûruosmaniye Köşkü" initial={data} />
    );
    expect(html).toContain('href="/tr/kosks/k1/desteler/yeni?oneri=p1"');
    expect(html).toContain('href="/tr/kosks/k1/desteler/yeni"');
    expect(html).toContain('href="/tr/decks/d1/cards"');
  });

  it("leaves the proposals block out when there are none", () => {
    const html = render(
      <KoskDecksView
        koskId="k1"
        koskName="Nûruosmaniye Köşkü"
        initial={{ ...data, proposals: [], proposalsTotal: 0 }}
      />
    );
    expect(html).not.toContain("Müderris önerileri");
    expect(html).toContain("Desteler");
  });

  it("says the köşk has no deck yet, and that the read failed", () => {
    expect(
      render(
        <KoskDecksView
          koskId="k1"
          koskName="Nûruosmaniye Köşkü"
          initial={{
            decks: [],
            proposals: [],
            decksTotal: 0,
            proposalsTotal: 0,
          }}
        />
      )
    ).toContain("Bu köşkün henüz destesi yok.");
    expect(
      render(
        <KoskDecksView
          koskId="k1"
          koskName="Nûruosmaniye Köşkü"
          initial={null}
        />
      )
    ).toContain("Desteler okunamadı");
  });

  it("on a failed read offers Yeniden dene and draws neither the empty state nor an open deck link", () => {
    const html = render(
      <KoskDecksView koskId="k1" koskName="" initial={null} />
    );
    expect(html).toContain("Yeniden dene");
    expect(html).not.toContain("Bu köşkün henüz destesi yok.");
    expect(html).not.toContain("0 deste");
    expect(html).not.toContain("’nün");
    expect(html).not.toContain("/desteler/yeni");
  });
});

describe("KoskDeckForm (nizam 35)", () => {
  it("opens filled in from the proposal, with its banner", () => {
    const html = render(
      <KoskDeckForm
        koskId="k1"
        koskName="Nûruosmaniye Köşkü"
        studentCount={74}
        proposal={proposal()}
      />
    );
    expect(html).toContain("Müderris önerisinden açılıyor");
    expect(html).toContain("İ’lâl kaideleri");
    expect(html).toContain("Tek bir köşk destesi iki derse yeter.");
    expect(html).toContain("Ayşe Nur Kılıçarslan");
    expect(html).toContain("74 talebe");
    expect(html).toContain("Desteyi aç");
    expect(html).toContain("Vazgeç");
  });

  it("hides the banner and starts empty without a proposal", () => {
    const html = render(
      <KoskDeckForm
        koskId="k1"
        koskName="Nûruosmaniye Köşkü"
        studentCount={74}
        proposal={null}
      />
    );
    expect(html).not.toContain("Müderris önerisinden açılıyor");
    expect(html).toContain("Kartlar sonra eklenir");
    expect(html).toContain("Kelime");
    expect(html).toContain("Hadis");
  });

  it("previews the card of the chosen type", () => {
    const vocabulary = render(
      <KoskDeckForm koskId="k1" koskName="K" studentCount={1} proposal={null} />
    );
    expect(vocabulary).toContain("Çağırdı, çağırır, çağırmak.");
    const hadith = render(
      <KoskDeckForm
        koskId="k1"
        koskName="K"
        studentCount={1}
        proposal={proposal({ cardType: "HADEETH" })}
      />
    );
    expect(hadith).toContain("Ameller niyetlere göredir.");
  });
});

describe("RejectDialog (canvas rule 17)", () => {
  it("draws nothing until it is opened (it lives in a portal)", () => {
    const html = render(
      <RejectDialog
        open={false}
        onOpenChange={() => {}}
        kind="request"
        subject="Mehmûz fiiller"
        onSubmit={async () => true}
      />
    );
    expect(html).toBe("");
  });
});

describe("the three languages carry the same keys", () => {
  const namespaces = [
    "DeckRequestsPage",
    "DeckReject",
    "KoskDecksPage",
    "KoskDeckForm",
  ] as const;
  const keysOf = (node: unknown, prefix = ""): string[] =>
    node && typeof node === "object"
      ? Object.entries(node).flatMap(([k, v]) =>
          keysOf(v, prefix ? `${prefix}.${k}` : k)
        )
      : [prefix];

  it.each(namespaces)("%s", (ns) => {
    const tr = keysOf(
      (resources.tr.nizam as unknown as Record<string, unknown>)[ns]
    ).sort();
    for (const lang of ["en", "ar"] as const) {
      expect(
        keysOf(
          (resources[lang].nizam as unknown as Record<string, unknown>)[ns]
        ).sort()
      ).toEqual(tr);
    }
  });
});
