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
  ].includes(errorCode(body) ?? "");

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
