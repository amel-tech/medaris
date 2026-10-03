import type { AuthzService } from "@medaris/common";
import { DeckReviewRepository } from "../../../src/deck-review/deck-review.repository";
import {
  DeckReviewService,
  PRIVATE_READ_ACTION,
} from "../../../src/deck-review/deck-review.service";
import {
  DeckProposalNotFoundError,
  DeckRequestNotFoundError,
  DeckRequestNotPendingError,
  DeckReviewForbiddenError,
} from "../../../src/deck-review/errors";
import { pagingOf } from "../../../src/deck-review/paging";
import { DeckPublishStatus } from "../../../src/flashcard/domain/deck-publish-status.enum";
import type { KoskService } from "../../../src/kosk/kosk.service";
import type { NotificationService } from "../../../src/notification/notification.service";

const ADMIN = { sub: "a1", realm_access: { roles: ["SYSTEM_ADMIN"] } };
const NAZIM = { sub: "a2" };
const KOSK = "b0000000-0000-4000-8000-0000000000aa";
const DECK = "b0000000-0000-4000-8000-0000000000bb";
const FIRST_PAGE = { limit: 12, offset: 0 };

const deck = (over: Record<string, unknown> = {}) => ({
  id: DECK,
  title: "Mehmûz fiiller",
  authorId: "owner",
  koskId: null,
  publishStatus: DeckPublishStatus.PENDING,
  archivedAt: null,
  ...over,
});

function serviceWith(
  repo: Record<string, unknown>,
  { manages = true, exists = true } = {}
) {
  const koskService = {
    isManager: vi.fn().mockResolvedValue(manages),
    exists: vi.fn().mockResolvedValue(exists),
  } as unknown as KoskService;
  const authz = {
    // Nobody here holds `platform.deck_publish` by a grant: the başnazım alone.
    can: async () => false,
    isSystemAdmin: (u: { realm_access?: { roles?: string[] } }) =>
      u.realm_access?.roles?.includes("SYSTEM_ADMIN") ?? false,
  } as unknown as AuthzService;
  const notify = vi.fn().mockResolvedValue(undefined);
  const notifications = { notify } as unknown as NotificationService;
  return {
    service: new DeckReviewService(
      repo as unknown as DeckReviewRepository,
      koskService,
      authz,
      notifications
    ),
    notify,
  };
}

describe("DeckReviewService (MDRS-180)", () => {
  describe("publish requests", () => {
    it("are the başnazım's alone", async () => {
      const { service } = serviceWith({});
      await expect(
        service.listRequests(NAZIM, "PENDING", FIRST_PAGE)
      ).rejects.toThrow(DeckReviewForbiddenError);
      await expect(service.approve(NAZIM, DECK)).rejects.toThrow(
        DeckReviewForbiddenError
      );
      await expect(service.readCards(NAZIM, DECK, false)).rejects.toThrow(
        DeckReviewForbiddenError
      );
    });

    it("are read a page at a time, with the counts of every request", async () => {
      const listRequests = vi.fn().mockResolvedValue([]);
      const { service } = serviceWith({
        listRequests,
        countRequests: vi.fn().mockResolvedValue({ pending: 30, decided: 130 }),
      });
      const page = await service.listRequests(ADMIN, "DECIDED", {
        limit: 50,
        offset: 100,
      });
      expect(listRequests).toHaveBeenCalledWith("DECIDED", 50, 100);
      expect(page.counts).toEqual({ pending: 30, decided: 130 });
    });

    it("writes the audit row before it reads the cards", async () => {
      const order: string[] = [];
      const { service } = serviceWith({
        findDeck: vi.fn().mockResolvedValue(deck()),
        countCards: vi.fn().mockResolvedValue(18),
        audit: vi.fn().mockImplementation(async () => void order.push("audit")),
        cards: vi.fn().mockImplementation(async () => {
          order.push("cards");
          return [];
        }),
      });
      await service.readCards(ADMIN, DECK, false);
      expect(order).toEqual(["audit", "cards"]);
    });

    it("records how much was read", async () => {
      const audit = vi.fn();
      const { service } = serviceWith({
        findDeck: vi.fn().mockResolvedValue(deck()),
        countCards: vi.fn().mockResolvedValue(18),
        audit,
        cards: vi.fn().mockResolvedValue([]),
      });
      await service.readCards(ADMIN, DECK, false);
      await service.readCards(ADMIN, DECK, true);
      expect(audit.mock.calls[0][0]).toMatchObject({
        action: PRIVATE_READ_ACTION,
        details: { scope: "sample", cards: 3 },
      });
      expect(audit.mock.calls[1][0]).toMatchObject({
        details: { scope: "all", cards: 18 },
      });
    });

    it("do not exist for a private deck, a hidden one or a missing one", async () => {
      for (const found of [
        null,
        deck({ publishStatus: DeckPublishStatus.PRIVATE }),
        deck({ archivedAt: new Date() }),
      ]) {
        const { service } = serviceWith({
          findDeck: vi.fn().mockResolvedValue(found),
        });
        await expect(service.approve(ADMIN, DECK)).rejects.toThrow(
          DeckRequestNotFoundError
        );
      }
    });

    it("answer 409 when the request was answered meanwhile, and tell nobody", async () => {
      const { service, notify } = serviceWith({
        findDeck: vi.fn().mockResolvedValue(deck()),
        reject: vi.fn().mockResolvedValue(false),
      });
      await expect(service.reject(ADMIN, DECK, "Kaynak yok.")).rejects.toThrow(
        DeckRequestNotPendingError
      );
      expect(notify).not.toHaveBeenCalled();
    });

    it("trim the reason they pass on to the owner", async () => {
      const reject = vi.fn().mockResolvedValue(true);
      const { service, notify } = serviceWith({
        findDeck: vi.fn().mockResolvedValue(deck()),
        reject,
      });
      await service.reject(ADMIN, DECK, "  Kaynak yok. ");
      expect(reject).toHaveBeenCalledWith(DECK, "a1", "Kaynak yok.");
      expect(notify.mock.calls[0][0]).toMatchObject({
        userId: "owner",
        type: "DECK_PUBLISH_RESULT",
        params: { outcome: "rejected", reason: "Kaynak yok." },
      });
    });

    it("still answer when the notification fails", async () => {
      const { service, notify } = serviceWith({
        findDeck: vi.fn().mockResolvedValue(deck()),
        approve: vi.fn().mockResolvedValue(true),
      });
      notify.mockRejectedValue(new Error("down"));
      await expect(service.approve(ADMIN, DECK)).resolves.toBeUndefined();
    });
  });

  describe("köşk decks", () => {
    it("are a nazım's of that köşk, or the başnazım's", async () => {
      const repo = {
        listKoskDecks: vi.fn().mockResolvedValue([]),
        listPendingProposals: vi.fn().mockResolvedValue([]),
        countKoskDecks: vi.fn().mockResolvedValue(0),
        countPendingProposals: vi.fn().mockResolvedValue(0),
      };
      const empty = {
        decks: [],
        proposals: [],
        decksTotal: 0,
        proposalsTotal: 0,
      };
      await expect(
        serviceWith(repo, { manages: false }).service.koskDecks(
          NAZIM,
          KOSK,
          FIRST_PAGE
        )
      ).rejects.toThrow(DeckReviewForbiddenError);
      await expect(
        serviceWith(repo, { manages: false }).service.koskDecks(
          ADMIN,
          KOSK,
          FIRST_PAGE
        )
      ).resolves.toEqual(empty);
      await expect(
        serviceWith(repo).service.koskDecks(NAZIM, KOSK, FIRST_PAGE)
      ).resolves.toEqual(empty);
    });

    it("are read a page at a time, with the totals of both lists", async () => {
      const repo = {
        listKoskDecks: vi.fn().mockResolvedValue([]),
        listPendingProposals: vi.fn().mockResolvedValue([]),
        countKoskDecks: vi.fn().mockResolvedValue(75),
        countPendingProposals: vi.fn().mockResolvedValue(14),
      };
      const res = await serviceWith(repo).service.koskDecks(NAZIM, KOSK, {
        limit: 12,
        offset: 24,
      });
      expect(repo.listKoskDecks).toHaveBeenCalledWith(KOSK, 12, 24);
      expect(repo.listPendingProposals).toHaveBeenCalledWith(KOSK, 12, 24);
      expect(res).toMatchObject({ decksTotal: 75, proposalsTotal: 14 });
    });

    it("hide only a shown köşk deck", async () => {
      for (const found of [
        null,
        deck({ koskId: null }),
        deck({ koskId: KOSK, archivedAt: new Date() }),
      ]) {
        const { service } = serviceWith({
          findDeck: vi.fn().mockResolvedValue(found),
        });
        await expect(service.hideDeck(NAZIM, DECK)).rejects.toThrow(
          /No köşk deck/
        );
      }
    });

    it("refuse a proposal that is not this köşk's", async () => {
      const { service } = serviceWith({
        findProposal: vi.fn().mockResolvedValue(null),
      });
      await expect(
        service.rejectProposal(NAZIM, KOSK, DECK, "Hayır")
      ).rejects.toThrow(DeckProposalNotFoundError);
    });

    it("take a proposal only from a müderris of the köşk", async () => {
      const { service } = serviceWith({
        muderrisCourseInKosk: vi.fn().mockResolvedValue(null),
      });
      await expect(
        service.propose(NAZIM, KOSK, {
          title: "x",
          cardType: "VOCABULARY" as never,
        })
      ).rejects.toThrow(DeckReviewForbiddenError);
    });
  });
});

describe("pagingOf (the köşk paging shape)", () => {
  it("starts at the first page and takes 12 rows when nothing else is asked", () => {
    expect(pagingOf(1, 12)).toEqual({ page: 1, limit: 12, offset: 0 });
  });

  it("skips the rows of the pages before", () => {
    expect(pagingOf(3, 12)).toEqual({ page: 3, limit: 12, offset: 24 });
  });

  it("holds a page below 1 to the first and a limit to 1..50", () => {
    expect(pagingOf(0, 12).offset).toBe(0);
    expect(pagingOf(-4, 12).page).toBe(1);
    expect(pagingOf(1, 0).limit).toBe(1);
    expect(pagingOf(2, 1000)).toEqual({ page: 2, limit: 50, offset: 50 });
  });
});
