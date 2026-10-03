import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DeckPublishStatus } from "../domain/deck-publish-status.enum";
import { FlashcardType } from "../domain/flashcard-type.enum";

export enum DeckSource {
  OWN = "OWN",
  COLLECTION = "COLLECTION",
}

export enum DeckCollectionKind {
  COURSE = "COURSE",
  KOSK = "KOSK",
  MADRASAH = "MADRASAH",
  PUBLIC = "PUBLIC",
}

/**
 * One deck as a list shows it (MDRS-164): the deck, where it comes from, and
 * the CALLER's progress through its cards. `GET /flashcard/decks/summary`
 * answers the Desteler page with these and `GET /flashcard/decks/explore` the
 * Keşfet one, so the page makes one request instead of one per deck.
 */
export class FlashcardDeckSummaryResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty()
  authorId!: string;

  @ApiProperty({ description: "The caller wrote this deck." })
  isMine!: boolean;

  @ApiProperty({ enum: FlashcardType, enumName: "FlashcardType" })
  cardType!: FlashcardType;

  @ApiProperty({ enum: DeckPublishStatus, enumName: "DeckPublishStatus" })
  publishStatus!: DeckPublishStatus;

  @ApiPropertyOptional({ type: Date, nullable: true })
  publishRequestedAt!: Date | null;

  @ApiProperty({
    enum: DeckSource,
    enumName: "DeckSource",
    description: "OWN: the caller wrote it. COLLECTION: somebody else did.",
  })
  source!: DeckSource;

  @ApiPropertyOptional({
    enum: DeckCollectionKind,
    enumName: "DeckCollectionKind",
    nullable: true,
    description:
      "Where a deck of somebody else's comes from; null for the caller's own decks.",
  })
  collectionKind!: DeckCollectionKind | null;

  @ApiProperty({ description: "The caller has the deck in the collection." })
  inCollection!: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      "The course, köşk or medrese the deck belongs to, by name; null for a public deck.",
  })
  contextTitle!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "The course's first müderris, for a course deck.",
  })
  muderrisName!: string | null;

  @ApiProperty()
  cardCount!: number;

  @ApiProperty({ description: "Cards the caller has mastered." })
  masteredCount!: number;

  @ApiProperty({ description: "Cards the caller is learning." })
  learningCount!: number;

  @ApiProperty({ description: "Cards the caller has not started." })
  newCount!: number;

  @ApiProperty({
    description:
      "Cards waiting for a repeat now (MDRS-165): started, and their review time has come, or they never got one while learning.",
  })
  dueCount!: number;

  @ApiProperty({
    description:
      "Cards written after the caller collected the deck; always 0 for the caller's own.",
  })
  addedSinceCollectedCount!: number;
}

export class FlashcardDeckExploreResponse {
  @ApiProperty({ type: [FlashcardDeckSummaryResponse] })
  courseDecks!: FlashcardDeckSummaryResponse[];

  @ApiProperty({ type: [FlashcardDeckSummaryResponse] })
  publicDecks!: FlashcardDeckSummaryResponse[];
}
