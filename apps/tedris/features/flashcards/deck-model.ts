import type {
  FlashcardDeckSummaryResponse,
  FlashcardResponse,
} from "@medaris/services/tedrisat";

/**
 * What the deck screens (design tedris/25-33, MDRS-164) derive from the API's
 * rows: the filters, the percentages, the status counts and the dates. Pure
 * and clock-free, so a spec can pin each of them.
 */

export type DeckStatus = "PRIVATE" | "PENDING" | "PUBLISHED";
export type MyDeckFilter = "all" | DeckStatus;
export type CardStatus = "NEW" | "LEARNING" | "MASTERED";
export type CardKind = "VOCABULARY" | "HADEETH";

export const MY_DECK_FILTERS: MyDeckFilter[] = [
  "all",
  "PRIVATE",
  "PENDING",
  "PUBLISHED",
];

/** `true` when the box is empty or every word of it is in the title or the description. */
export const matchesQuery = (
  deck: { title: string; description?: string | null },
  query: string,
  locale = "tr"
): boolean => {
  const words = query
    .toLocaleLowerCase(locale)
    .split(/\s+/)
    .filter((w) => w !== "");
  if (words.length === 0) return true;
  const haystack = `${deck.title} ${deck.description ?? ""}`.toLocaleLowerCase(
    locale
  );
  return words.every((w) => haystack.includes(w));
};

/** The caller's own decks, then the collected ones, split by who wrote them. */
export const splitDecks = (list: FlashcardDeckSummaryResponse[]) => ({
  mine: list.filter((d) => d.isMine),
  collected: list.filter((d) => !d.isMine),
});

export const filterMyDecks = (
  decks: FlashcardDeckSummaryResponse[],
  filter: MyDeckFilter,
  query = "",
  locale = "tr"
): FlashcardDeckSummaryResponse[] =>
  decks.filter(
    (d) =>
      (filter === "all" || d.publishStatus === filter) &&
      matchesQuery(d, query, locale)
  );

/** Whole percent; 0 for a deck with no cards rather than a division by nothing. */
export const percentOf = (done: number, total: number): number =>
  total <= 0 ? 0 : Math.round((Math.min(done, total) / total) * 100);

/** A card's status for the caller: no progress row is a new card. */
export const cardStatus = (card: FlashcardResponse): CardStatus => {
  const own = card.progress?.[0]?.status;
  return own === "LEARNING" || own === "MASTERED" ? own : "NEW";
};

export interface CardCounts {
  total: number;
  new: number;
  learning: number;
  mastered: number;
}

/** New + learning + mastered is always the total: the three are one partition. */
export const countCards = (cards: FlashcardResponse[]): CardCounts => {
  const counts: CardCounts = {
    total: cards.length,
    new: 0,
    learning: 0,
    mastered: 0,
  };
  for (const card of cards) {
    const status = cardStatus(card);
    if (status === "MASTERED") counts.mastered += 1;
    else if (status === "LEARNING") counts.learning += 1;
    else counts.new += 1;
  }
  return counts;
};

/**
 * How many of the cards wait for a repeat at `now` (MDRS-165): started, and
 * their review time has come, or never set while learning. The same rule the
 * API counts `dueCount` with, read off the progress rows the page already has.
 */
export const dueNow = (
  cards: FlashcardResponse[],
  now: Date = new Date()
): number =>
  cards.filter((card) => {
    const progress = card.progress?.[0];
    if (!progress || progress.status === "NEW") return false;
    if (progress.dueAt) return new Date(progress.dueAt) <= now;
    return progress.status === "LEARNING";
  }).length;

export const SAMPLE_CARDS = 6;
export const READER_PAGE = 6;

/** How many rows show after "Daha fazla göster": six more, never past the total. */
export const showMore = (shown: number, total: number): number =>
  Math.min(total, shown + READER_PAGE);

/**
 * The tags box: comma separated, trimmed, empty ones dropped, repeats dropped
 * (compared as the Turkish alphabet does), at most `MAX_TAGS` of at most
 * `MAX_TAG_LENGTH` characters, which is what the API takes.
 */
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;

export const parseTags = (text: string): string[] => {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of text.split(/[,\n،]/)) {
    const tag = part.trim();
    const key = tag.toLocaleLowerCase("tr");
    if (tag === "" || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
};

export const tagsProblem = (tags: string[]): "tooMany" | "tooLong" | null =>
  tags.length > MAX_TAGS
    ? "tooMany"
    : tags.some((t) => t.length > MAX_TAG_LENGTH)
      ? "tooLong"
      : null;

/** The API's bounds on a deck's name (`CreateFlashcardDeckDto`). */
export const TITLE_MIN = 5;
export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 1000;

export type TitleProblem = "required" | "tooShort" | "tooLong" | null;

export const titleProblem = (title: string): TitleProblem => {
  const trimmed = title.trim();
  if (trimmed === "") return "required";
  if (trimmed.length < TITLE_MIN) return "tooShort";
  if (trimmed.length > TITLE_MAX) return "tooLong";
  return null;
};

/** An edit changes nothing when the trimmed name and description are the stored ones. */
export const unchanged = (
  deck: { title: string; description?: string | null },
  next: { title: string; description: string }
): boolean =>
  deck.title === next.title.trim() &&
  (deck.description ?? "") === next.description.trim();

const TR_MONTH_LOCATIVE = [
  "Ocak’ta",
  "Şubat’ta",
  "Mart’ta",
  "Nisan’da",
  "Mayıs’ta",
  "Haziran’da",
  "Temmuz’da",
  "Ağustos’ta",
  "Eylül’de",
  "Ekim’de",
  "Kasım’da",
  "Aralık’ta",
];

/**
 * "29 Eylül’de" for the card's "istendi" line. The Turkish ending depends on
 * the month's last sound, so it comes from a table of the twelve months rather
 * than from a rule; other languages take the plain day and month.
 */
export const dayAndMonth = (
  at: Date,
  locale: string,
  timeZone: string
): string => {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "numeric",
    month: "long",
  }).formatToParts(at);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  if (locale.startsWith("tr")) {
    const monthIndex = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        month: "numeric",
      }).format(at)
    );
    return `${day} ${TR_MONTH_LOCATIVE[monthIndex - 1] ?? month}`;
  }
  return `${day} ${month}`;
};

/** "29 Eylül 2026 Salı 21:10": the day with its weekday and the time, in the viewer's zone. */
export const fullDateTime = (
  at: Date,
  locale: string,
  timeZone: string
): string => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat(locale, {
      timeZone,
      day: "numeric",
      month: "long",
      year: "numeric",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  );
  return `${parts.day} ${parts.month} ${parts.year} ${parts.weekday} ${parts.hour}:${parts.minute}`;
};

/** The two initials a deck's tile shows; the kit's `Avatar` derives them from the name. */
export const kindOf = (deck: { cardType: string }): CardKind =>
  deck.cardType === "HADEETH" ? "HADEETH" : "VOCABULARY";

/** The source line a card carries in its meta ("Buhârî, Müslim"), if it has one. */
export const sourceOf = (card: FlashcardResponse): string | null => {
  const meta = card.contentMeta;
  if (meta && typeof meta === "object" && "source" in meta) {
    const source = (meta as { source: unknown }).source;
    if (typeof source === "string" && source.trim() !== "") return source;
  }
  return null;
};

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/** A card face written in Arabic script reads right to left, in the Arabic face. */
export const isArabic = (text: string): boolean => ARABIC.test(text);

/** The API's bounds on a card's two faces (`CreateFlashcardDto`). */
export const FACE_MIN = 3;
export const FACE_MAX = 5000;

export type FaceProblem = "required" | "tooShort" | "tooLong" | null;

export const faceProblem = (text: string): FaceProblem => {
  const trimmed = text.trim();
  if (trimmed === "") return "required";
  if (trimmed.length < FACE_MIN) return "tooShort";
  if (trimmed.length > FACE_MAX) return "tooLong";
  return null;
};

export type ImportField = "front" | "back" | "type" | "other";
export type ImportProblemKind = "required" | "tooShort" | "tooLong" | "invalid";

export interface ImportProblem {
  field: ImportField;
  kind: ImportProblemKind;
}

/** What the import endpoint answers to a file with bad rows: the rows and what is wrong in each. */
export interface ImportRowError {
  row: number;
  problems: ImportProblem[];
}

const importFieldOf = (name: unknown, message: string): ImportField => {
  const text = typeof name === "string" && name !== "" ? name : message;
  if (text.startsWith("contentFront")) return "front";
  if (text.startsWith("contentBack")) return "back";
  if (text.startsWith("type") || text.startsWith("cardType")) return "type";
  return "other";
};

/**
 * One field's validator sentences, which are English and several per value
 * ("must be shorter than…; must be longer than…; must be a string" is one
 * missing value), read as the single thing wrong with it.
 */
const importKindOf = (messages: string[]): ImportProblemKind => {
  const all = messages.join(" ").toLowerCase();
  if (all.includes("should not be empty") || all.includes("must be a string")) {
    return "required";
  }
  if (all.includes("shorter than")) return "tooLong";
  if (all.includes("longer than")) return "tooShort";
  return "invalid";
};

/** Reads the 422 body (`context.errors`) into rows with what is wrong in each; empty when it is not that shape. */
export const importRowErrors = (body: unknown): ImportRowError[] => {
  const errors = (body as { context?: { errors?: unknown } } | null)?.context
    ?.errors;
  if (!Array.isArray(errors)) return [];
  return errors.flatMap((entry): ImportRowError[] => {
    const row = (entry as { row?: unknown }).row;
    const fields = (entry as { errors?: unknown }).errors;
    if (typeof row !== "number" || !Array.isArray(fields)) return [];
    const byField = new Map<ImportField, string[]>();
    for (const f of fields) {
      const message = (f as { message?: unknown }).message;
      if (typeof message !== "string") continue;
      const field = importFieldOf((f as { field?: unknown }).field, message);
      byField.set(field, [...(byField.get(field) ?? []), message]);
    }
    return [
      {
        row,
        problems: [...byField].map(([field, messages]) => ({
          field,
          kind: importKindOf(messages),
        })),
      },
    ];
  });
};

const TR_VOWELS = "aıoueiöü";
const lastVowel = (word: string): string =>
  [...word].reverse().find((c) => TR_VOWELS.includes(c)) ?? "e";

/** How a Turkish number is last said, whose vowel and final sound the suffix follows. */
export const trNumberWord = (n: number): string => {
  if (n === 0) return "sıfır";
  const ones = [
    "",
    "bir",
    "iki",
    "üç",
    "dört",
    "beş",
    "altı",
    "yedi",
    "sekiz",
    "dokuz",
  ];
  const tens = [
    "",
    "on",
    "yirmi",
    "otuz",
    "kırk",
    "elli",
    "altmış",
    "yetmiş",
    "seksen",
    "doksan",
  ];
  if (n % 10 !== 0) return ones[n % 10] ?? "";
  if (n % 100 !== 0) return tens[(n % 100) / 10] ?? "";
  if (n % 1000 !== 0) return "yüz";
  if (n % 1_000_000 !== 0) return "bin";
  return "milyon";
};

/** "21:10’da": the time's locative, which follows how its minutes are said (…on → da, …yirmi → de, …kırk → ta). */
export const trLocative = (word: string, hard = false): string => {
  const back = "aıou".includes(lastVowel(word));
  const voiceless = "çfhkpsşt".includes(word.at(-1) ?? "");
  const initial = hard && voiceless ? "t" : "d";
  return `${initial}${back ? "a" : "e"}`;
};

/** Appends the locative to a time, "21:10" → "21:10’da"; only Turkish has one. */
export const atTime = (time: string, locale: string): string => {
  if (!locale.startsWith("tr")) return time;
  const minutes = Number(time.slice(-2));
  const word = trNumberWord(minutes);
  return `${time}’${trLocative(word, true)}`;
};

/** "6’sı": a count with its possessive suffix, as Turkish counts it ("40 karttan 6’sı"); other locales get the bare count. */
export const countOf = (n: number, locale: string): string => {
  if (!locale.startsWith("tr")) return String(n);
  const word = trNumberWord(n);
  const endsInVowel = "aıoueiöü".includes(word.at(-1) ?? "");
  const vowel = lastVowel(word);
  const harmony = "aı".includes(vowel)
    ? "ı"
    : "ei".includes(vowel)
      ? "i"
      : "ou".includes(vowel)
        ? "u"
        : "ü";
  return `${n}’${endsInVowel ? "s" : ""}${harmony}`;
};
