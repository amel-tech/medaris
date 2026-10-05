import type {
  DeckProposalResponse,
  FlashcardType,
} from "@medaris/services/tedrisat";

/**
 * Pure helpers behind the deck screens (nizam 16, 30 and 35, MDRS-180): what a
 * form may send, how a row is dated, which sentence an error code stands for.
 * No React and no I/O, so the rules the designs state can be pinned by plain
 * specs.
 */
export const REASON_MAX = 1000;
export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 1000;

export const CARD_TYPES: readonly FlashcardType[] = ["VOCABULARY", "HADEETH"];

export const isBlank = (value: string): boolean => value.trim() === "";

/** Rows in one read of a list; the API's own default, asked for out loud so both sides agree. */
export const DECK_PAGE_SIZE = 12;

/**
 * The page "Daha fazla göster" asks for: the first page that holds a row not
 * loaded yet. A row that left the list (answered, hidden) pulls the rows after
 * it forward, so counting loaded rows rather than clicks never skips one.
 */
export const nextPage = (loaded: number, size = DECK_PAGE_SIZE): number =>
  Math.floor(loaded / size) + 1;

/** The rows already shown, then the ones of the page that are not among them. */
export const mergeById = <T extends { id: string }>(
  shown: readonly T[],
  incoming: readonly T[]
): T[] => {
  const known = new Set(shown.map((row) => row.id));
  return [...shown, ...incoming.filter((row) => !known.has(row.id))];
};

/**
 * The tab counts after a waiting request leaves the list. Only an answer this
 * screen made moves a request into "Karara bağlanan": one that is gone (deleted,
 * withdrawn, or answered by someone else) leaves that count to the next read
 * of the tab.
 */
export const countsAfterLeaving = (
  counts: { pending: number; decided: number },
  answered: boolean
): { pending: number; decided: number } => ({
  pending: Math.max(0, counts.pending - 1),
  decided: answered ? counts.decided + 1 : counts.decided,
});

/** The tab counts after a published deck is taken back: it leaves "Karara bağlanan" and is not waiting. */
export const countsAfterUnpublish = (counts: {
  pending: number;
  decided: number;
}): { pending: number; decided: number } => ({
  ...counts,
  decided: Math.max(0, counts.decided - 1),
});

/** "29 Eyl 21:10" — the day and minute a request or proposal came, in the viewer's zone. */
export function shortDateTime(
  at: Date | string,
  opts: { locale: string; timeZone: string }
): string {
  const date = typeof at === "string" ? new Date(at) : at;
  return new Intl.DateTimeFormat(opts.locale, {
    timeZone: opts.timeZone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** "29 Eyl" — the day alone, for the proposal footer. */
export function shortDate(
  at: Date | string,
  opts: { locale: string; timeZone: string }
): string {
  const date = typeof at === "string" ? new Date(at) : at;
  return new Intl.DateTimeFormat(opts.locale, {
    timeZone: opts.timeZone,
    day: "numeric",
    month: "short",
  }).format(date);
}

/** "29 Eylül 2026 Salı 21:10" — the long form the request's detail prints. */
export function longDateTime(
  at: Date | string,
  opts: { locale: string; timeZone: string }
): string {
  const date = typeof at === "string" ? new Date(at) : at;
  return new Intl.DateTimeFormat(opts.locale, {
    timeZone: opts.timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** The error codes tedrisat answers these screens with, and the message key of each. */
const ERROR_KEYS: Record<string, string> = {
  DECK_REQUEST_NOT_PENDING: "errors.requestAnswered",
  DECK_REQUEST_NOT_FOUND: "errors.requestGone",
  DECK_PROPOSAL_NOT_PENDING: "errors.proposalAnswered",
  DECK_PROPOSAL_NOT_FOUND: "errors.proposalGone",
  KOSK_DECK_NOT_FOUND: "errors.deckGone",
  DECK_REVIEW_FORBIDDEN: "errors.forbidden",
  DECK_NOT_PUBLISHED: "errors.notPublished",
};

export const errorCode = (body: unknown): string | null =>
  body && typeof body === "object" && "code" in body
    ? String((body as { code: unknown }).code)
    : null;

/** The message key under the screen's namespace for a failed answer; null for an unknown failure. */
export const deckErrorKey = (body: unknown): string | null =>
  ERROR_KEYS[errorCode(body) ?? ""] ?? null;

/**
 * The message key for a failed answer. A code this screen knows gets its own
 * sentence; anything else (the server unreachable, a reply without a body, a
 * code nobody mapped) gets the generic one, because the library's own text for
 * those is English and not for the person to read.
 */
export const deckFailureKey = (body: unknown): string =>
  deckErrorKey(body) ?? "errors.generic";

/** Whether the answer says the thing is already gone, so the row should leave the list. */
export const isGone = (body: unknown): boolean =>
  [
    "DECK_REQUEST_NOT_PENDING",
    "DECK_REQUEST_NOT_FOUND",
    "DECK_PROPOSAL_NOT_PENDING",
    "DECK_PROPOSAL_NOT_FOUND",
    "DECK_NOT_PUBLISHED",
  ].includes(errorCode(body) ?? "");

/**
 * "Yayından kaldır" sits on a published deck and only for the başnazım: a
 * Medaris nazımı holding `platform.deck_publish` sees the list without it, and
 * tedrisat answers him 403 all the same.
 */
export const canUnpublish = (
  outcome: "PENDING" | "PUBLISHED" | "REJECTED",
  isBasnazim: boolean
): boolean => isBasnazim && outcome === "PUBLISHED";

export interface DeckFormValues {
  title: string;
  description: string;
  cardType: FlashcardType;
}

export const emptyDeckForm = (): DeckFormValues => ({
  title: "",
  description: "",
  cardType: "VOCABULARY",
});

/** The proposal's own words, so "Kabul et" opens the form filled in. */
export const formFromProposal = (
  proposal: Pick<DeckProposalResponse, "title" | "description" | "cardType">
): DeckFormValues => ({
  title: proposal.title,
  description: proposal.description ?? "",
  cardType: proposal.cardType,
});

export type DeckFormError = "titleRequired" | null;

/** The one rule the form states: a deck needs a name. */
export const validateDeckForm = (values: DeckFormValues): DeckFormError =>
  isBlank(values.title) ? "titleRequired" : null;

/** What the form sends; the blank description is left out. */
export const deckPayload = (values: DeckFormValues, proposalId?: string) => ({
  title: values.title.trim(),
  description: isBlank(values.description)
    ? undefined
    : values.description.trim(),
  cardType: values.cardType,
  proposalId,
});

/** Which sample card the form's side panel shows for a card type. */
export const previewKey = (cardType: FlashcardType): "vocabulary" | "hadith" =>
  cardType === "HADEETH" ? "hadith" : "vocabulary";

/** The path the proposal's "Kabul et" opens. */
export const newDeckHref = (koskId: string, proposalId?: string): string =>
  `/kosks/${koskId}/desteler/yeni${proposalId ? `?oneri=${proposalId}` : ""}`;
