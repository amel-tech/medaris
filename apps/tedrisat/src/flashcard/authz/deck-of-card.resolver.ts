import { type AuthzResolve, ENTITIES } from "@medaris/common";
import { CardNotFoundError } from "../errors/card-not-found.error";
import { FlashcardService } from "../flashcard.service";

/**
 * `@Authz` resolver for the card routes: a card authorizes against its
 * parent deck.
 *
 * Cards carry no access rule of their own — `flashcards.authorId` is
 * provenance, not permission, and every card in a deck is written by that
 * deck's author anyway. So the question "may this caller touch this card"
 * is only ever answered by `decks`, one `deckId` lookup away.
 *
 * A missing card raises `CardNotFoundError` from inside the resolver, which
 * `AuthzGuard.resolveResource` propagates untouched: the same `CARD_NOT_FOUND`
 * 404 the labeling routes raise for the same question, rather than the 403 a
 * deny would produce for a card that is simply not there.
 *
 * `strict: false` on the `ModuleRef.get`: the guard is provided by the global
 * `AuthzModule` in `@medaris/common`, so it resolves from a different module
 * than the one that registers `FlashcardService`.
 */
export const byParentDeckOfCard =
  (param = "id"): AuthzResolve =>
  async (req, moduleRef) => {
    const cardId =
      typeof req.params[param] === "string" ? req.params[param] : "";
    const deckId = await moduleRef
      .get(FlashcardService, { strict: false })
      .findDeckId(cardId);
    if (deckId === null) throw new CardNotFoundError(cardId);
    return { entity: ENTITIES.FLASHCARD_DECK, id: deckId };
  };
