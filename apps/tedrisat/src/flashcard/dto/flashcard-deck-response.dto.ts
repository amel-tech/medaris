import { ApiProperty, ApiPropertyOptional, OmitType } from "@nestjs/swagger";
import { CreateFlashcardDeckDto } from "./create-flashcard-deck.dto";

export class FlashcardDeckResponse extends OmitType(CreateFlashcardDeckDto, [
  "description",
] as const) {
  @ApiProperty()
  id!: string;

  // Published so a client can predict the 403 the deck-scoped bulk/export
  // routes now return to a non-author (MDRS-63) and hide those affordances,
  // and so the generated client keeps the column the handler already returns,
  // which is how a caller tells whose deck this is (MDRS-83). The value has
  // always been on the wire; the generated client picks it up when the spec is
  // next regenerated (MDRS-58's exporter).
  @ApiProperty()
  authorId!: string;

  @ApiPropertyOptional({ type: String })
  description!: string | null;
}
