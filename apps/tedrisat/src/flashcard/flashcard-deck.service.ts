import { Injectable } from "@nestjs/common";
import { DeckForbiddenError } from "./errors/deck-forbidden.error";
import { DeckNotFoundError } from "./errors/deck-not-found.error";
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
   * Modelled on `KoskService.assertOwner`, down to the one-column read
   * (`findAuthorId`, the sibling of `KoskRepository.findOwnerId`) and the
   * 404/403 split: a deck that is not there is a `DeckNotFoundError` and a
   * deck that belongs to somebody else is a `DeckForbiddenError`. That
   * distinction is an enumeration oracle — the caller learns a UUID exists —
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
    const deck = await this.deckRepo.findVisibility(deckId);
    if (deck === null) {
      throw new DeckNotFoundError(deckId);
    }
    if (deck.authorId !== userId && !deck.isPublic) {
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
    deckId: string
  ): Promise<IFlashcardDeckVisibility | null> {
    return this.deckRepo.findVisibility(deckId);
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

  async findAll(include?: string[]): Promise<IFlashcardDeck[]> {
    const includeSet = new Set(include);
    return this.deckRepo.findAll(includeSet);
  }

  async findAllVisibleToUser(
    userId: string,
    filters?: IFlashcardDeckFilters,
    include?: string[]
  ): Promise<IFlashcardDeck[]> {
    const includeSet = new Set(include);
    return this.deckRepo.findAllVisibleToUser(userId, filters, includeSet);
  }

  async findAllByUser(userId: string): Promise<IFlashcardDeck[]> {
    return this.deckRepo.findAllByUser(userId);
  }

  async create(newDeck: ICreateFlashcardDeck): Promise<IFlashcardDeck> {
    return this.deckRepo.create(newDeck);
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
    return this.deckRepo.update(id, updates);
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
