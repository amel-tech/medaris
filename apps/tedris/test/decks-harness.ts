import { resources } from "@medaris/i18n";
import type {
  FlashcardDeckResponse,
  FlashcardDeckSummaryResponse,
  FlashcardResponse,
} from "@medaris/services/tedrisat";
import type { createTranslator as CreateTranslator } from "next-intl";

/**
 * What the deck component specs share (MDRS-164): the real Turkish catalogue
 * behind next-intl's own translator (ICU included), and rows shaped like the
 * API's. The `vi.mock` calls themselves stay in each spec: Vitest hoists them
 * per file. `createTranslator` is handed in by the mock's factory
 * (`importOriginal`): this module cannot import next-intl itself, for the mock
 * replaces it and the factory waits on this very module.
 */
export const translatorFor = (
  createTranslator: typeof CreateTranslator,
  namespace: string
) => {
  const [root, ...rest] = namespace.split(".");
  // The app's two catalogues (MDRS-165): `tedris` is read as the namespaces
  // inside it, `tedrisLearn` (the study and home screens) as itself.
  return createTranslator({
    locale: "tr",
    messages: {
      ...resources.tr.tedris,
      tedrisLearn: resources.tr.tedrisLearn,
    },
    namespace: (root === "tedris" ? rest : [root, ...rest])
      .filter(Boolean)
      .join(".") as never,
  });
};

export const summary = (
  over: Partial<FlashcardDeckSummaryResponse> = {}
): FlashcardDeckSummaryResponse =>
  ({
    id: "d1",
    title: "Mehmûz fiiller",
    description: "Hemzeli fiillerin çekimleri ve emir sîgaları.",
    authorId: "me",
    isMine: true,
    cardType: "VOCABULARY",
    publishStatus: "PRIVATE",
    publishRequestedAt: null,
    source: "OWN",
    collectionKind: null,
    inCollection: false,
    contextTitle: null,
    muderrisName: null,
    cardCount: 18,
    masteredCount: 6,
    learningCount: 7,
    newCount: 5,
    dueCount: 7,
    addedSinceCollectedCount: 0,
    ...over,
  }) as FlashcardDeckSummaryResponse;

export const deckResponse = (
  over: Partial<FlashcardDeckResponse> = {}
): FlashcardDeckResponse =>
  ({
    id: "d1",
    title: "Mehmûz fiiller",
    isPublic: false,
    authorId: "me",
    description: "Hemzeli fiillerin çekimleri ve emir sîgaları.",
    cardType: "VOCABULARY",
    publishStatus: "PRIVATE",
    publishRequestedAt: null,
    tags: [],
    ...over,
  }) as FlashcardDeckResponse;

export const cardRow = (
  n: number,
  status?: "NEW" | "LEARNING" | "MASTERED",
  over: Partial<FlashcardResponse> = {}
): FlashcardResponse =>
  ({
    id: `c${n}`,
    deckId: "d1",
    authorId: "me",
    type: "VOCABULARY",
    contentFront: `أَخَذَ ${n}`,
    contentBack: `Aldı ${n}`,
    progress: status
      ? [{ userId: "viewer", flashcardId: `c${n}`, status }]
      : [],
    ...over,
  }) as unknown as FlashcardResponse;
