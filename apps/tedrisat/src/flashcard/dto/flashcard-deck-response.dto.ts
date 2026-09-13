import { ApiProperty, ApiPropertyOptional, OmitType } from "@nestjs/swagger";
import { CreateFlashcardDeckDto } from "./create-flashcard-deck.dto";

export class FlashcardDeckResponse extends OmitType(CreateFlashcardDeckDto, [
  "description",
] as const) {
  @ApiProperty()
  id!: string;

  // The handler already returns this column; declaring it is what lets the
  // generated client keep it, so a caller can tell whose deck this is.
  @ApiProperty()
  authorId!: string;

  @ApiPropertyOptional({ type: String })
  description!: string | null;
}
