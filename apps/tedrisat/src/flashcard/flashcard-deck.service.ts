import { Injectable } from "@nestjs/common";
import { DeckPublishStatus } from "./domain/deck-publish-status.enum";
import { DeckForbiddenError } from "./errors/deck-forbidden.error";
import { DeckNotFoundError } from "./errors/deck-not-found.error";
import { DeckPublishStateError } from "./errors/deck-publish-state.error";
import { FlashcardDeckRepository } from "./flashcard-deck.repository";
import {
  ICreateFlashcardDeck,
  IFlashcardDeck,
  IFlashcardDeckFilters,
  IFlashcardDeckOwnership,
  IFlashcardDeckUserCollectionItem,
  IFlashcardDeckVisibility,
  IUpdateFlashcardDeck,
} from "./flashcard-deck.repository.interface";

/**
 * Labels the author typed are the author's: every other reader gets the deck
 * without them (MDRS-164, "etiketlerini yalnız sen görürsün").
 */
const forViewer = (deck: IFlashcardDeck, viewerId: string | null) =>
  deck.authorId === viewerId ? deck : { ...deck, tags: [] };

/** Trimmed, no blanks, no repeats (compared without regard to case), in the order typed. */
export const normalizeTags = (tags: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    const key = tag.toLocaleLowerCase("tr");
    if (tag === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
};

@Injectable()
export class FlashcardDeckService {
  constructor(private readonly deckRepo: FlashcardDeckRepository) {}

  async findById(
    id: string,
    include?: string[]
  ): Promise<IFlashcardDeck | null> {
    const includeSet = new Set(include);
    return this.deckRepo.findById(id, includeSet);
  }

  /**
   * Ensures the deck exists and is authored by `userId`, else throws.
   *
   * Modelled on `KoskService.assertOwner` (since MDRS-126 `assertManager`),
   * down to the one-column read (`findAuthorId`) and the 404/403 split: a
   * deck that is not there is a `DeckNotFoundError` and a deck that belongs
   * to somebody else is a `DeckForbiddenError`. That distinction is an
   * enumeration oracle — the caller learns a UUID exists —
   * and it is kept deliberately, the way the label routes keep it: deck ids
   * are v4 UUIDs and are not enumerable in practice, whereas a blanket 404
   * would make a genuine permission problem indistinguishable from a
   * mistyped id.
   *
   * Ownership is `authorId` and nothing else. `isPublic` is visibility: a
   * public deck may be read and collected by anyone, but only its author may
   * write cards into it or export it. There is no role model in this
   * repository (no @Roles, no RolesGuard, nothing in the JWT), so there is no
   * administrator who may act on another user's deck. Shared/collaborative
   * decks are MDRS-45's problem; if they arrive, this is the method that
   * learns about them.
   *
   * A caller that also needs a column off the deck — `exportCards` wants
   * `title` for the filename — uses `findOwned` below, which reads the
   * two-column `findOwnership` projection and makes the same decision
   * through the same private method, so the rule lives in one place and
   * neither caller pays for the other's query shape.
   */
  async assertOwner(deckId: string, userId: string): Promise<void> {
    this.assertAuthoredBy(
      deckId,
      await this.deckRepo.findAuthorId(deckId),
      userId
    );
  }

  /**
   * `assertOwner` for a caller that needs the deck's title as well: one
   * two-column query, the same 404/403 decision, `{ authorId, title }` back.
   */
  async findOwned(
    deckId: string,
    userId: string
  ): Promise<IFlashcardDeckOwnership> {
    const deck = await this.deckRepo.findOwnership(deckId);
    this.assertAuthoredBy(deckId, deck?.authorId ?? null, userId);
    // `assertAuthoredBy` has thrown if `deck` is null.
    return deck as IFlashcardDeckOwnership;
  }

  /**
   * Ensures the deck exists and may be READ by `userId`, else throws.
   *
   * The read rule is deliberately wider than the write rule: `isPublic` is
   * visibility, so a public deck is readable by any authenticated caller
   * while only its author may write to it. `assertOwner` above is therefore
   * not a substitute — using it on the read routes would hide every public
   * deck's cards from everyone but their author, which is the product's
   * whole browse-and-study flow.
   *
   * One two-column query (`findVisibility`), because that is all the
   * decision reads. A deck that is not there is a `DeckNotFoundError`, as on
   * the write paths; a private deck belonging to somebody else is a
   * `DeckForbiddenError`.
   */
  async assertReadable(deckId: string, userId: string): Promise<void> {
    this.assertVisibleTo(
      deckId,
      await this.deckRepo.findVisibility(deckId, userId),
      userId
    );
  }

  /**
   * `assertReadable` for a caller that wants the deck itself: ONE read of the
   * row, and the decision made from the two columns it already carries.
   *
   * `assertReadable(id)` followed by `findById(id)` read `decks` twice on the
   * busiest deck route. The rule stays here rather than moving into the
   * controller — both paths go through `assertVisibleTo`, so a change to what
   * "readable" means lands in one place.
   */
  async findReadable(
    deckId: string,
    userId: string | null,
    include?: string[],
    options: { adminRead?: boolean } = {}
  ): Promise<IFlashcardDeck> {
    const deck = await this.findById(deckId, include);
    // A private deck of somebody else's may still be this caller's to read
    // when it belongs to a course they are in (`deckSharedWith`); that is
    // asked only when the cheaper answers did not settle it.
    const shared =
      deck !== null &&
      userId !== null &&
      deck.authorId !== userId &&
      !deck.isPublic &&
      (await this.deckRepo.findVisibility(deckId, userId))?.sharedWithViewer ===
        true;
    this.assertVisibleTo(
      deckId,
      deck && { ...deck, sharedWithViewer: shared },
      userId,
      options.adminRead === true
    );
    // `assertVisibleTo` has thrown if `deck` is null.
    return forViewer(deck as IFlashcardDeck, userId);
  }

  /**
   * The read rule, written once: the author always, anybody else only when the
   * deck is public. A deck that is not there is a 404 on both paths. A `null`
   * caller is an anonymous one (MDRS-45) and is nobody's author.
   */
  private assertVisibleTo(
    deckId: string,
    deck: {
      authorId: string;
      isPublic: boolean;
      sharedWithViewer?: boolean;
    } | null,
    userId: string | null,
    adminRead = false
  ): void {
    if (deck === null) {
      throw new DeckNotFoundError(deckId);
    }
    if (
      deck.authorId !== userId &&
      !deck.isPublic &&
      deck.sharedWithViewer !== true &&
      !adminRead
    ) {
      throw new DeckForbiddenError(
        "This deck is private and belongs to another user"
      );
    }
  }

  /**
   * The two columns an access decision is made from, or `null` for a deck
   * that is not there. Exposed for `TedrisatRoleResolver`, which reads
   * exactly `authorId` and `isPublic` and must not pay for `findById`'s
   * full row inside the authz guard.
   */
  async findVisibility(
    deckId: string,
    viewerId?: string
  ): Promise<IFlashcardDeckVisibility | null> {
    return this.deckRepo.findVisibility(deckId, viewerId);
  }

  /**
   * The ownership rule, written once. A shared/collaborative-deck decision
   * (MDRS-45) changes this method and nothing else.
   */
  private assertAuthoredBy(
    deckId: string,
    authorId: string | null,
    userId: string
  ): void {
    if (authorId === null) {
      throw new DeckNotFoundError(deckId);
    }
    if (authorId !== userId) {
      throw new DeckForbiddenError();
    }
  }

  /** Public decks only — the list an anonymous caller sees (MDRS-45). */
  async findAll(include?: string[]): Promise<IFlashcardDeck[]> {
    const includeSet = new Set(include);
    return (await this.deckRepo.findAll(includeSet)).map((deck) =>
      forViewer(deck, null)
    );
  }

  async findAllVisibleToUser(
    userId: string,
    filters?: IFlashcardDeckFilters,
    include?: string[]
  ): Promise<IFlashcardDeck[]> {
    const includeSet = new Set(include);
    return (
      await this.deckRepo.findAllVisibleToUser(userId, filters, includeSet)
    ).map((deck) => forViewer(deck, userId));
  }

  async findAllByUser(userId: string): Promise<IFlashcardDeck[]> {
    return (await this.deckRepo.findAllByUser(userId)).map((deck) =>
      forViewer(deck, userId)
    );
  }

  async create(newDeck: ICreateFlashcardDeck): Promise<IFlashcardDeck> {
    return this.deckRepo.create({
      ...newDeck,
      tags: newDeck.tags && normalizeTags(newDeck.tags),
    });
  }

  /**
   * The author asks for the deck to be published (MDRS-164). Only a private
   * deck can ask: one already waiting or already public answers 409 rather
   * than moving its clock. Whether the caller is the author is the route's
   * `@Authz`, not decided here.
   */
  async requestPublish(deckId: string): Promise<IFlashcardDeck> {
    const deck = await this.deckRepo.findById(deckId);
    if (deck === null) throw new DeckNotFoundError(deckId);
    // A refused deck may ask again (MDRS-180); a waiting or public one may not.
    if (
      deck.publishStatus !== DeckPublishStatus.PRIVATE &&
      deck.publishStatus !== DeckPublishStatus.REJECTED
    ) {
      throw new DeckPublishStateError(deckId, deck.publishStatus);
    }
    return this.setPublishRequest(
      deckId,
      DeckPublishStatus.PENDING,
      new Date()
    );
  }

  /**
   * The author takes the request back, or takes a published deck back to
   * private ("istediğin an özele çekebilirsin"). A deck that is private
   * already has nothing to withdraw.
   */
  async withdrawPublish(deckId: string): Promise<IFlashcardDeck> {
    const deck = await this.deckRepo.findById(deckId);
    if (deck === null) throw new DeckNotFoundError(deckId);
    if (deck.publishStatus === DeckPublishStatus.PRIVATE) {
      throw new DeckPublishStateError(deckId, deck.publishStatus);
    }
    if (deck.publishStatus === DeckPublishStatus.PUBLISHED) {
      const updated = await this.deckRepo.setPrivate(deckId);
      if (updated === null) throw new DeckNotFoundError(deckId);
      return updated;
    }
    return this.setPublishRequest(deckId, DeckPublishStatus.PRIVATE, null);
  }

  private async setPublishRequest(
    deckId: string,
    status: DeckPublishStatus,
    requestedAt: Date | null
  ): Promise<IFlashcardDeck> {
    const deck = await this.deckRepo.setPublishRequest(
      deckId,
      status,
      requestedAt
    );
    if (deck === null) throw new DeckNotFoundError(deckId);
    return deck;
  }

  async addToUserCollection(
    userId: string,
    deckId: string
  ): Promise<IFlashcardDeckUserCollectionItem> {
    return this.deckRepo.addToUserCollection(userId, deckId);
  }

  async update(
    id: string,
    updates: IUpdateFlashcardDeck
  ): Promise<IFlashcardDeck | null> {
    return this.deckRepo.update(id, {
      ...updates,
      tags: updates.tags && normalizeTags(updates.tags),
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.deckRepo.delete(id);
  }

  async removeFromUserCollection(
    userId: string,
    deckId: string
  ): Promise<IFlashcardDeckUserCollectionItem> {
    return this.deckRepo.removeFromUserCollection(userId, deckId);
  }
}
