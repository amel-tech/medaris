import { Injectable } from "@nestjs/common";
import { DeckForbiddenError } from "./errors/deck-forbidden.error";
import { DeckNotFoundError } from "./errors/deck-not-found.error";
import { FlashcardDeckRepository } from "./flashcard-deck.repository";
import {
  ICreateFlashcardDeck,
  IFlashcardDeck,
  IFlashcardDeckFilters,
  IFlashcardDeckUserCollectionItem,
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
   * A caller that also needs the deck itself — `exportCards` wants `title`
   * for the filename — uses `findOwned` below, which makes the same decision
   * on the full row so it does not pay for a second round trip.
   */
  async assertOwner(deckId: string, userId: string): Promise<void> {
    const authorId = await this.deckRepo.findAuthorId(deckId);
    if (authorId === null) {
      throw new DeckNotFoundError(deckId);
    }
    if (authorId !== userId) {
      throw new DeckForbiddenError();
    }
  }

  /**
   * `assertOwner` for a caller that needs the deck row as well: one query,
   * the same 404/403 decision, the deck returned. Keep the two in step — the
   * ownership rule lives in both bodies on purpose, so that neither pays for
   * the other's query shape.
   */
  async findOwned(deckId: string, userId: string): Promise<IFlashcardDeck> {
    const deck = await this.deckRepo.findById(deckId);
    if (!deck) {
      throw new DeckNotFoundError(deckId);
    }
    if (deck.authorId !== userId) {
      throw new DeckForbiddenError();
    }
    return deck;
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
