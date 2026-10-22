/**
 * Ders desteleri as rules: what the deck and card forms check before anything
 * is sent, what each write sends, how a deck's numbers read, and which
 * sentence a refusal gets. Pure on purpose, so the screens have nothing to
 * decide. tedrisat is the authority on every write; these checks only spare a
 * round trip and name the field.
 */

export const decksHref = (courseId: string): string =>
  `/ders/${encodeURIComponent(courseId)}/deste`;

export const deckHref = (courseId: string, deckId: string): string =>
  `${decksHref(courseId)}/${encodeURIComponent(deckId)}`;

// ---- the deck ---------------------------------------------------------------------

export type CardType = "VOCABULARY" | "HADEETH";

export const CARD_TYPES: readonly CardType[] = ["VOCABULARY", "HADEETH"];

export const DECK_TITLE_MIN = 5;
export const DECK_TITLE_MAX = 100;
export const DECK_DESCRIPTION_MAX = 1000;
export const FACE_MIN = 3;
export const FACE_MAX = 5000;

/** A deck as the list and the detail page show it: plain data, nothing that depends on the clock. */
export interface DeckFact {
  id: string;
  title: string;
  description: string | null;
  cardType: CardType;
  cardCount: number;
  weekId: string | null;
  weekNumber: number | null;
  draft: boolean;
  /** 0..1, the share of the enrolled talebe's MASTERED cards */
  masteredRatio: number;
  enrolledCount: number;
}

export interface WeekOption {
  id: string;
  weekNumber: number;
  title: string;
}

/** The first letters of a deck's title for its cover tile: at most two, a space-free word counts once. */
export function coverInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const letters = words
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("");
  return letters.toLocaleUpperCase("tr");
}

/** The share of talebe who mastered a deck, as a whole percent, 0..100. */
export const masteredPercent = (ratio: number): number =>
  Math.round(Math.max(0, Math.min(1, Number(ratio) || 0)) * 100);

/**
 * The header's totals: how many decks, how many cards in all, and how many
 * talebe the course has enrolled (each deck carries the course's count, so the
 * largest one is the course's, and a list with no decks has none to read).
 */
export function deckTotals(decks: readonly DeckFact[]): {
  decks: number;
  cards: number;
  students: number;
} {
  return {
    decks: decks.length,
    cards: decks.reduce((sum, deck) => sum + deck.cardCount, 0),
    students: decks.reduce((max, deck) => Math.max(max, deck.enrolledCount), 0),
  };
}

export interface DeckDraft {
  title: string;
  description: string;
  cardType: CardType;
  /** the week's id, or '' for none */
  weekId: string;
  draft: boolean;
}

export const newDeckDraft = (): DeckDraft => ({
  title: "",
  description: "",
  cardType: "VOCABULARY",
  weekId: "",
  draft: false,
});

export type DeckField = "title" | "description";

/** The field problems of a deck draft; empty when it may be sent. */
export function deckProblems(
  draft: DeckDraft
): Partial<Record<DeckField, "required" | "length">> {
  const problems: Partial<Record<DeckField, "required" | "length">> = {};
  const title = draft.title.trim();
  if (title.length === 0) problems.title = "required";
  else if (title.length < DECK_TITLE_MIN || title.length > DECK_TITLE_MAX)
    problems.title = "length";
  if (draft.description.trim().length > DECK_DESCRIPTION_MAX)
    problems.description = "length";
  return problems;
}

/** The body of a create: a missing description or week is left out, not sent empty. */
export function createDeckBody(draft: DeckDraft): {
  title: string;
  description?: string;
  cardType: CardType;
  weekId?: string;
  draft: boolean;
} {
  const description = draft.description.trim();
  return {
    title: draft.title.trim(),
    ...(description ? { description } : {}),
    cardType: draft.cardType,
    ...(draft.weekId ? { weekId: draft.weekId } : {}),
    draft: draft.draft,
  };
}

/**
 * The body of a settings save: only what changed. An emptied description or
 * a cleared week is sent as null, which is how the API takes them away.
 */
export function deckPatch(
  before: DeckFact,
  draft: DeckDraft
): {
  title?: string;
  description?: string | null;
  weekId?: string | null;
  draft?: boolean;
} {
  const patch: {
    title?: string;
    description?: string | null;
    weekId?: string | null;
    draft?: boolean;
  } = {};
  const title = draft.title.trim();
  if (title !== before.title) patch.title = title;
  const description = draft.description.trim();
  if (description !== (before.description ?? "")) {
    patch.description = description === "" ? null : description;
  }
  if ((draft.weekId || null) !== before.weekId) {
    patch.weekId = draft.weekId || null;
  }
  if (draft.draft !== before.draft) patch.draft = draft.draft;
  return patch;
}

export const deckDraftOf = (deck: DeckFact): DeckDraft => ({
  title: deck.title,
  description: deck.description ?? "",
  cardType: deck.cardType,
  weekId: deck.weekId ?? "",
  draft: deck.draft,
});

// ---- the cards --------------------------------------------------------------------

export interface CardFact {
  id: string;
  type: CardType;
  contentFront: string;
  contentBack: string;
}

export interface CardDraft {
  type: CardType;
  contentFront: string;
  contentBack: string;
}

export const newCardDraft = (type: CardType): CardDraft => ({
  type,
  contentFront: "",
  contentBack: "",
});

export type CardField = "contentFront" | "contentBack";

export function cardProblems(
  draft: CardDraft
): Partial<Record<CardField, "required" | "length">> {
  const problems: Partial<Record<CardField, "required" | "length">> = {};
  for (const field of ["contentFront", "contentBack"] as const) {
    const value = draft[field].trim();
    if (value.length === 0) problems[field] = "required";
    else if (value.length < FACE_MIN || value.length > FACE_MAX)
      problems[field] = "length";
  }
  return problems;
}

/** Trimmed faces, the card's type as it is. */
export const cardBody = (draft: CardDraft) => ({
  type: draft.type,
  contentFront: draft.contentFront.trim(),
  contentBack: draft.contentBack.trim(),
});

export const cardDraftOf = (card: CardFact): CardDraft => ({
  type: card.type,
  contentFront: card.contentFront,
  contentBack: card.contentBack,
});

// ---- refusals ---------------------------------------------------------------------

/**
 * The message key for a refused write, from the API's code. The server's own
 * message never reaches the page.
 */
export function deckErrorKey(code: string): string {
  if (code === "COURSE_DECK_NOT_DRAFT") return "notDraft";
  return "failed";
}

// ---- Excel import -----------------------------------------------------------------

export interface ImportRowProblem {
  row: number;
  messages: string[];
}

/** A row list from the API's 422 body, shaped for the dialog; anything else is no list. */
export function importRowProblems(body: unknown): ImportRowProblem[] {
  const context =
    body && typeof body === "object" && "context" in body
      ? (body as { context: unknown }).context
      : null;
  const errors =
    context && typeof context === "object" && "errors" in context
      ? (context as { errors: unknown }).errors
      : null;
  if (!Array.isArray(errors)) return [];
  return errors.flatMap((entry): ImportRowProblem[] => {
    if (!entry || typeof entry !== "object") return [];
    const { row, errors: fields } = entry as {
      row?: unknown;
      errors?: unknown;
    };
    if (typeof row !== "number") return [];
    const messages = Array.isArray(fields)
      ? fields.flatMap((field) =>
          field &&
          typeof field === "object" &&
          "message" in field &&
          typeof (field as { message: unknown }).message === "string"
            ? [(field as { message: string }).message]
            : []
        )
      : [];
    return [{ row, messages }];
  });
}

/** The file's name must end in one of the two formats the API reads. */
export const IMPORT_EXTENSIONS = [".xlsx", ".csv"] as const;
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

export function importFileProblem(file: {
  name: string;
  size: number;
}): "type" | "size" | null {
  const lower = file.name.toLowerCase();
  if (!IMPORT_EXTENSIONS.some((extension) => lower.endsWith(extension)))
    return "type";
  if (file.size > IMPORT_MAX_BYTES) return "size";
  return null;
}
