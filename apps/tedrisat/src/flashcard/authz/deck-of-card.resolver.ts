import {
  AuthzMissingUserError,
  type AuthzResolve,
  ENTITIES,
} from "@medaris/common";
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
 * A missing card, and a card in a deck the caller may not see, raise
 * `CardNotFoundError` from inside the resolver (`findVisibleDeckId`), which
 * `AuthzGuard.resolveResource` propagates untouched: the same
 * `CARD_NOT_FOUND` 404 for both, so the status code does not tell a
 * stranger which card ids exist (MDRS-43 AC-4). A card in a PUBLIC deck the
 * caller does not own still resolves, and the engine then denies the write
 * permissions with a 403 — that caller can already see the card.
 *
 * `strict: false` on the `ModuleRef.get`: the guard is provided by the global
 * `AuthzModule` in `@medaris/common`, so it resolves from a different module
 * than the one that registers `FlashcardService`.
 */
export const byParentDeckOfCard =
  (param = "id"): AuthzResolve =>
  async (req, moduleRef) => {
    // `AuthzGuard` rejects a request without a user before it resolves the
    // resource; this narrows the type and fails closed if that ever changes.
    if (!req.user) throw new AuthzMissingUserError();
    const cardId =
      typeof req.params[param] === "string" ? req.params[param] : "";
    const deckId = await moduleRef
      .get(FlashcardService, { strict: false })
      .findVisibleDeckId(req.user, cardId);
    return { entity: ENTITIES.FLASHCARD_DECK, id: deckId };
  };
