import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DeckPublishStatus } from "../domain/deck-publish-status.enum";
import { FlashcardType } from "../domain/flashcard-type.enum";

export class FlashcardDeckResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  isPublic!: boolean;

  // Published so a client can predict the 403 the deck-scoped bulk/export
  // routes now return to a non-author (MDRS-63) and hide those affordances,
  // and so the generated client keeps the column the handler already returns,
  // which is how a caller tells whose deck this is (MDRS-83). The value has
  // always been on the wire; the generated client picks it up when the spec is
  // next regenerated (MDRS-58's exporter).
  @ApiProperty()
  authorId!: string;

  // Published as it always was (an optional string): the köşk and nizam apps
  // read it under that type, and `null` on the wire is read as absent.
  @ApiPropertyOptional({ type: String })
  description!: string | null;

  @ApiProperty({ enum: FlashcardType, enumName: "FlashcardType" })
  cardType!: FlashcardType;

  @ApiProperty({ enum: DeckPublishStatus, enumName: "DeckPublishStatus" })
  publishStatus!: DeckPublishStatus;

  @ApiPropertyOptional({ type: Date, nullable: true })
  publishRequestedAt!: Date | null;

  @ApiProperty({
    type: [String],
    description: "Empty for everyone but the author.",
  })
  tags!: string[];
}
