import {
  type AuthenticatedUser,
  AuthzForbiddenError,
  AuthzService,
  ENTITIES,
  SCOPES,
} from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { CardIncludeEnum } from "./domain/card-include.enum";
import { CreateFlashcardDto } from "./dto/create-flashcard.dto";
import { CreateFlashcardProgressDto } from "./dto/create-flashcard-progress.dto";
import { CardNotFoundError } from "./errors/card-not-found.error";
import { FlashcardRepository } from "./flashcard.repository";
import {
  ICreateFlashcard,
  IFlashcard,
  IFlashcardProgress,
  IUpdateFlashcard,
} from "./flashcard.repository.interface";

const validIncludes = new Set<string>(Object.values(CardIncludeEnum));

function toIncludeSet(include?: string[]): Set<CardIncludeEnum> {
  if (!include) return new Set();
  return new Set(
    include.filter((v): v is CardIncludeEnum => validIncludes.has(v))
  );
}

@Injectable()
export class FlashcardService {
  constructor(
    private readonly cardRepo: FlashcardRepository,
    private readonly authz: AuthzService
  ) {}

  async findById(
    id: string,
    userId: string,
    include?: string[]
  ): Promise<IFlashcard | null> {
    return this.cardRepo.findById(id, userId, toIncludeSet(include));
  }

  async findByDeckId(
    deckId: string,
    userId: string,
    include?: string[]
  ): Promise<IFlashcard[]> {
    return this.cardRepo.findByDeckId(deckId, userId, toIncludeSet(include));
  }

  /**
   * The parent deck of a card, or `null` when the card does not exist. The
   * card routes are authorized through their deck — there is no per-card
   * ownership table — so every `cards/:id` handler resolves this first.
   */
  async findDeckId(cardId: string): Promise<string | null> {
    return this.cardRepo.findDeckId(cardId);
  }

  async createMany(
    deckId: string,
    authorId: string,
    cards: CreateFlashcardDto[]
  ): Promise<IFlashcard[]> {
    const newCards: ICreateFlashcard[] = cards.map((card) => ({
      ...card,
      deckId,
      authorId,
    }));
    return this.cardRepo.createMany(newCards);
  }

  /**
   * Record the caller's progress against a list of cards.
   *
   * The one route in the flashcard module whose authorization cannot be a
   * `@Authz` decorator: the body names N cards in any number of decks, and
   * `@Authz` names one resource, so a decorator would check the first id and
   * wave the rest through. The check therefore lives here, and it is a batch:
   * one `findVisibilityByIds` for every distinct id, against the two queries
   * per card the controller's stopgap was paying.
   *
   * Two outcomes, deliberately different — and this is the pair MDRS-43's
   * AC-5 pins down:
   *   - an id with no card behind it is a 404, not a deny. It used to reach
   *     the UPSERT and trip the `flashcardId` FK as a 500, which leaked
   *     "no such card" through a server error.
   *   - an id whose deck the caller cannot read is `AuthzForbiddenError`.
   *     Any real card id used to answer 200 here, including one inside
   *     somebody else's private deck.
   *
   * SYSTEM_ADMIN bypasses both, the same way `AuthzService.can` does for the
   * decorator path — otherwise this route would be the one place in the
   * module where the realm role does not hold.
   */
  async replaceManyProgress(
    user: AuthenticatedUser,
    progress: CreateFlashcardProgressDto[]
  ): Promise<IFlashcardProgress[]> {
    const userId = user.sub;
    await this.assertProgressTargetsVisible(user, progress);

    // `userId` last, not first: it is the authenticated caller's id and must
    // win over anything the request body carries. This order is the only thing
    // enforcing that. `CreateFlashcardProgressDto` declaring no `userId` means
    // TypeScript never sees one, not that the property is removed: the route
    // binds `@Body(new ParseArrayPipe({ items: CreateFlashcardProgressDto }))`
    // (flashcard.controller.ts:152), which builds its own ValidationPipe from
    // those options alone and so inherits neither `whitelist` nor
    // `forbidNonWhitelisted`, while the global MedarisValidationPipe skips the
    // parameter outright — its metatype is the native `Array`. Measured: an
    // extra `userId` in a body element is neither stripped nor rejected and
    // arrives in `data`.
    const progressWithUser = progress.map((data) => ({
      ...data,
      userId,
    }));

    return this.cardRepo.replaceManyProgress(progressWithUser);
  }

  /**
   * Every card named in the body must exist and sit in a deck the caller may
   * read. De-duplicated first: a study session posts many cards from one
   * deck, and the ids repeat.
   *
   * The visibility rule is `FlashcardDeckService.assertVisibleTo`'s — author
   * always, anybody else only when the deck is public — applied to the
   * columns the join already carried back rather than re-read per deck.
   */
  private async assertProgressTargetsVisible(
    user: AuthenticatedUser,
    progress: CreateFlashcardProgressDto[]
  ): Promise<void> {
    if (this.authz.isSystemAdmin(user)) return;

    const cardIds = [...new Set(progress.map((p) => p.flashcardId))];
    const rows = await this.cardRepo.findVisibilityByIds(cardIds);
    const byCard = new Map(rows.map((r) => [r.cardId, r]));

    for (const cardId of cardIds) {
      const row = byCard.get(cardId);
      if (!row) throw new CardNotFoundError(cardId);
      if (row.authorId !== user.sub && !row.isPublic) {
        throw new AuthzForbiddenError(undefined, {
          userId: user.sub,
          entity: ENTITIES.FLASHCARD_DECK,
          resourceId: row.deckId,
          scope: SCOPES.VIEW,
        });
      }
    }
  }

  async update(
    id: string,
    updates: IUpdateFlashcard
  ): Promise<IFlashcard | null> {
    return this.cardRepo.update(id, updates);
  }

  async delete(id: string): Promise<boolean> {
    return this.cardRepo.delete(id);
  }
}
