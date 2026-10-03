import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from "class-validator";
import { FlashcardType } from "../../flashcard/domain/flashcard-type.enum";

export const DECK_REVIEW_REASON_MAX = 1000;
export const DECK_TITLE_MAX = 200;
export const DECK_DESCRIPTION_MAX = 1000;

export const DECK_REQUEST_STATUSES = ["PENDING", "DECIDED"] as const;
export type DeckRequestStatus = (typeof DECK_REQUEST_STATUSES)[number];

export class DeckPersonResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  name!: string | null;
}

export class DeckPublishRequestResponse {
  @ApiProperty({ format: "uuid", description: "The deck's id" })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ enum: FlashcardType, enumName: "FlashcardType" })
  cardType!: FlashcardType;

  @ApiProperty()
  cardCount!: number;

  @ApiProperty({ type: DeckPersonResponse })
  owner!: DeckPersonResponse;

  @ApiProperty({ type: Date })
  requestedAt!: Date;

  @ApiProperty({
    enum: ["PENDING", "PUBLISHED", "REJECTED"],
    description: "PENDING waits; PUBLISHED and REJECTED are answered.",
  })
  outcome!: "PENDING" | "PUBLISHED" | "REJECTED";

  @ApiPropertyOptional({ type: Date, nullable: true })
  decidedAt!: Date | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  rejectReason!: string | null;
}

export class DeckPublishRequestListResponse {
  @ApiProperty({ type: [DeckPublishRequestResponse] })
  items!: DeckPublishRequestResponse[];

  @ApiProperty({ description: "Requests waiting for an answer" })
  pendingCount!: number;

  @ApiProperty({ description: "Requests answered (published or refused)" })
  decidedCount!: number;
}

export class DeckRequestCardResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  front!: string;

  @ApiProperty()
  back!: string;
}

export class DeckRequestCardsResponse {
  @ApiProperty({ type: [DeckRequestCardResponse] })
  items!: DeckRequestCardResponse[];

  @ApiProperty({ description: "Every card the deck holds" })
  total!: number;
}

export class RejectReasonDto {
  @ApiProperty({
    example: "Kartlarda kaynak gösterilmemiş.",
    description: "Shown to the person it is for. Required, and not blank.",
  })
  @IsString()
  @MaxLength(DECK_REVIEW_REASON_MAX)
  @Matches(/\S/, { message: "reason must not be blank" })
  reason!: string;
}

export class ManagedKoskDeckResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ enum: FlashcardType, enumName: "FlashcardType" })
  cardType!: FlashcardType;

  @ApiProperty()
  cardCount!: number;

  @ApiProperty({ type: Date })
  updatedAt!: Date;
}

export class DeckProposalResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ enum: FlashcardType, enumName: "FlashcardType" })
  cardType!: FlashcardType;

  @ApiProperty({ type: DeckPersonResponse })
  proposedBy!: DeckPersonResponse;

  @ApiPropertyOptional({ type: String, nullable: true })
  courseTitle!: string | null;

  @ApiProperty({ type: Date })
  createdAt!: Date;
}

export class ManagedKoskDecksResponse {
  @ApiProperty({ type: [ManagedKoskDeckResponse] })
  decks!: ManagedKoskDeckResponse[];

  @ApiProperty({ type: [DeckProposalResponse] })
  proposals!: DeckProposalResponse[];

  @ApiProperty({ description: "Every shown deck of the köşk, not the page" })
  decksTotal!: number;

  @ApiProperty({
    description: "Every proposal nobody has answered, not the page",
  })
  proposalsTotal!: number;
}

export class CreateKoskDeckDto {
  @ApiProperty({ example: "Sarfın temel kelimeleri" })
  @IsString()
  @MaxLength(DECK_TITLE_MAX)
  @Matches(/\S/, { message: "title must not be blank" })
  title!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(DECK_DESCRIPTION_MAX)
  description?: string;

  @ApiProperty({ enum: FlashcardType, enumName: "FlashcardType" })
  @IsEnum(FlashcardType)
  cardType!: FlashcardType;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "The proposal this deck answers; it is accepted together with the deck.",
  })
  @IsOptional()
  @IsUUID()
  proposalId?: string;
}

export class CreateDeckProposalDto {
  @ApiProperty({ example: "İ'lâl kaideleri" })
  @IsString()
  @MaxLength(DECK_TITLE_MAX)
  @Matches(/\S/, { message: "title must not be blank" })
  title!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(DECK_DESCRIPTION_MAX)
  description?: string;

  @ApiProperty({ enum: FlashcardType, enumName: "FlashcardType" })
  @IsEnum(FlashcardType)
  cardType!: FlashcardType;

  @ApiPropertyOptional({
    format: "uuid",
    description: "One of the proposer's courses in this köşk.",
  })
  @IsOptional()
  @IsUUID()
  courseId?: string;
}

export class CreatedIdResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;
}
