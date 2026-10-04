import {
  AuthenticatedUser,
  AuthzService,
  ENTITIES,
  PERMISSIONS,
} from "@medaris/common";
import { Injectable, Logger } from "@nestjs/common";
import { SCOPE_TYPES } from "../database/schema/scope-type.schema";
import { DeckPublishStatus } from "../flashcard/domain/deck-publish-status.enum";
import { KoskNotFoundError } from "../kosk/errors/kosk-not-found.error";
import { KoskService } from "../kosk/kosk.service";
import { NotificationService } from "../notification/notification.service";
import {
  DeckReviewRepository,
  IDeckProposal,
  IKoskDeck,
  IPublishRequest,
  IRequestCounts,
} from "./deck-review.repository";
import {
  DeckProposalNotFoundError,
  DeckProposalNotPendingError,
  DeckRequestNotFoundError,
  DeckRequestNotPendingError,
  DeckReviewForbiddenError,
  KoskDeckNotFoundError,
} from "./errors";

/** How many cards "Örnek kartlar" shows. */
export const SAMPLE_CARD_COUNT = 3;

/** One page of a list: the clamped `limit` and the rows before it. */
export interface IPaging {
  limit: number;
  offset: number;
}

export const PRIVATE_READ_ACTION = "deck.private-read";

export interface ICreateKoskDeck {
  title: string;
  description?: string;
  cardType: IKoskDeck["cardType"];
  proposalId?: string;
}

/**
 * The deck screens of the nizam (MDRS-180): the başnazım's review of publish
 * requests (nizam/16) and a köşk nazımı's own decks, the müderris proposals
 * and the Gizle action (nizam/30 and 35).
 *
 * Authorization is here, not in `@Authz`: the engine has no entity for either
 * question. Reviewing publish requests is the Medaris başnazımı's
 * (SYSTEM_ADMIN) alone, since `platform.deck_publish` is not enforced
 * anywhere yet; a köşk's decks are its nazımları's and the başnazım's.
 */
@Injectable()
export class DeckReviewService {
  private readonly logger = new Logger(DeckReviewService.name);

  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: DeckReviewRepository,
    private readonly koskService: KoskService,
    private readonly authz: AuthzService,
    private readonly notifications: NotificationService
  ) {}

  // ---- publish requests ----

  async listRequests(
    user: AuthenticatedUser,
    status: "PENDING" | "DECIDED",
    paging: IPaging
  ): Promise<{ items: IPublishRequest[]; counts: IRequestCounts }> {
    await this.assertChief(user);
    const [items, counts] = await Promise.all([
      this.repo.listRequests(status, paging.limit, paging.offset),
      this.repo.countRequests(),
    ]);
    return { items, counts };
  }

  /**
   * The cards of a request. Reading a private deck is written to the audit
   * log first, so a read that is not recorded does not happen.
   */
  async readCards(
    user: AuthenticatedUser,
    deckId: string,
    all: boolean
  ): Promise<{
    items: { id: string; front: string; back: string }[];
    total: number;
  }> {
    await this.assertChief(user);
    const deck = await this.requireRequest(deckId);
    const total = await this.repo.countCards(deckId);
    await this.repo.audit({
      actorId: user.sub,
      action: PRIVATE_READ_ACTION,
      entityId: deckId,
      details: {
        title: deck.title,
        owner: deck.authorId,
        scope: all ? "all" : "sample",
        cards: all ? total : Math.min(total, SAMPLE_CARD_COUNT),
      },
    });
    const items = await this.repo.cards(
      deckId,
      all ? undefined : SAMPLE_CARD_COUNT
    );
    return { items, total };
  }

  async approve(user: AuthenticatedUser, deckId: string): Promise<void> {
    await this.assertChief(user);
    const deck = await this.requireRequest(deckId);
    if (!(await this.repo.approve(deckId, user.sub))) {
      throw new DeckRequestNotPendingError(deckId);
    }
    await this.tell(deck.authorId, deckId, {
      outcome: "approved",
      deckTitle: deck.title,
    });
  }

  async reject(
    user: AuthenticatedUser,
    deckId: string,
    reason: string
  ): Promise<void> {
    await this.assertChief(user);
    const deck = await this.requireRequest(deckId);
    const trimmed = reason.trim();
    if (!(await this.repo.reject(deckId, user.sub, trimmed))) {
      throw new DeckRequestNotPendingError(deckId);
    }
    await this.tell(deck.authorId, deckId, {
      outcome: "rejected",
      deckTitle: deck.title,
      reason: trimmed,
    });
  }

  /** A deck with a request on record: waiting, or answered. */
  private async requireRequest(deckId: string) {
    const deck = await this.repo.findDeck(deckId);
    if (
      !deck ||
      deck.archivedAt !== null ||
      deck.publishStatus === DeckPublishStatus.PRIVATE
    ) {
      throw new DeckRequestNotFoundError(deckId);
    }
    return deck;
  }

  // ---- köşk decks and proposals ----

  async koskDecks(
    user: AuthenticatedUser,
    koskId: string,
    paging: IPaging
  ): Promise<{
    decks: IKoskDeck[];
    proposals: IDeckProposal[];
    decksTotal: number;
    proposalsTotal: number;
  }> {
    await this.assertKoskNazim(user, koskId);
    const [decks, proposals, decksTotal, proposalsTotal] = await Promise.all([
      this.repo.listKoskDecks(koskId, paging.limit, paging.offset),
      this.repo.listPendingProposals(koskId, paging.limit, paging.offset),
      this.repo.countKoskDecks(koskId),
      this.repo.countPendingProposals(koskId),
    ]);
    return { decks, proposals, decksTotal, proposalsTotal };
  }

  async createKoskDeck(
    user: AuthenticatedUser,
    koskId: string,
    input: ICreateKoskDeck
  ): Promise<{ id: string }> {
    await this.assertKoskNazim(user, koskId);
    if (input.proposalId) {
      const proposal = await this.repo.findProposal(koskId, input.proposalId);
      if (!proposal) throw new DeckProposalNotFoundError(input.proposalId);
      if (proposal.status !== "PENDING") {
        throw new DeckProposalNotPendingError(input.proposalId);
      }
    }
    const created = await this.repo.createKoskDeck(
      {
        koskId,
        authorId: user.sub,
        title: input.title.trim(),
        description: input.description?.trim() || undefined,
        cardType: input.cardType,
      },
      input.proposalId,
      user.sub
    );
    if (!created) throw new DeckProposalNotPendingError(input.proposalId ?? "");
    return created;
  }

  async hideDeck(user: AuthenticatedUser, deckId: string): Promise<void> {
    const deck = await this.repo.findDeck(deckId);
    if (!deck || deck.koskId === null || deck.archivedAt !== null) {
      throw new KoskDeckNotFoundError(deckId);
    }
    await this.assertKoskNazim(user, deck.koskId);
    // The başnazım hides as the platform, the köşk's nazımı as the köşk: the
    // level a restore is then compared with (MDRS-135).
    const level = this.authz.isSystemAdmin(user)
      ? SCOPE_TYPES.PLATFORM
      : SCOPE_TYPES.KOSK;
    if (!(await this.repo.hideDeck(deckId, user.sub, level))) {
      throw new KoskDeckNotFoundError(deckId);
    }
  }

  async rejectProposal(
    user: AuthenticatedUser,
    koskId: string,
    proposalId: string,
    reason: string
  ): Promise<void> {
    await this.assertKoskNazim(user, koskId);
    const proposal = await this.repo.findProposal(koskId, proposalId);
    if (!proposal) throw new DeckProposalNotFoundError(proposalId);
    const trimmed = reason.trim();
    if (!(await this.repo.rejectProposal(proposalId, user.sub, trimmed))) {
      throw new DeckProposalNotPendingError(proposalId);
    }
    await this.tell(proposal.proposedBy, null, {
      outcome: "proposal_rejected",
      deckTitle: proposal.title,
      reason: trimmed,
    });
  }

  /** A müderris of one of the köşk's courses suggests a deck. */
  async propose(
    user: AuthenticatedUser,
    koskId: string,
    input: {
      title: string;
      description?: string;
      cardType: IKoskDeck["cardType"];
      courseId?: string;
    }
  ): Promise<{ id: string }> {
    if (!(await this.koskService.exists(koskId))) {
      throw new KoskNotFoundError(koskId);
    }
    const courseId = await this.repo.muderrisCourseInKosk(
      user.sub,
      koskId,
      input.courseId
    );
    if (!courseId) {
      throw new DeckReviewForbiddenError(
        "Only a müderris of a course in this köşk may propose a deck"
      );
    }
    const id = await this.repo.createProposal({
      koskId,
      proposedBy: user.sub,
      courseId,
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
      cardType: input.cardType,
    });
    return { id };
  }

  // ---- decisions ----

  /** The başnazım, or a Medaris nazımı holding `platform.deck_publish` (MDRS-135). */
  private async assertChief(user: AuthenticatedUser): Promise<void> {
    if (this.authz.isSystemAdmin(user)) return;
    if (
      await this.authz.can(
        user,
        { entity: ENTITIES.FLASHCARD_DECK, id: "any" },
        PERMISSIONS.PLATFORM_DECK_PUBLISH
      )
    ) {
      return;
    }
    throw new DeckReviewForbiddenError(
      "Only the Medaris başnazımı and a Medaris nazımı holding platform.deck_publish may review deck publish requests"
    );
  }

  private async assertKoskNazim(
    user: AuthenticatedUser,
    koskId: string
  ): Promise<void> {
    if (!(await this.koskService.exists(koskId))) {
      throw new KoskNotFoundError(koskId);
    }
    if (this.authz.isSystemAdmin(user)) return;
    if (await this.koskService.isManager(koskId, user.sub)) return;
    throw new DeckReviewForbiddenError("You are not a nazım of this köşk");
  }

  /** Tells the person; a notification that fails never undoes the decision. */
  private async tell(
    userId: string,
    deckId: string | null,
    params: Record<string, string>
  ): Promise<void> {
    try {
      await this.notifications.notify({
        userId,
        type: "DECK_PUBLISH_RESULT",
        targetType: deckId ? "DECK" : null,
        targetId: deckId,
        params,
      });
    } catch (error) {
      this.logger.error("Could not notify of a deck decision", error);
    }
  }
}
