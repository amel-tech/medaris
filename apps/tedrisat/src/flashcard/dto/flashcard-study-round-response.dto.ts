import { ApiProperty } from "@nestjs/swagger";
import { FlashcardResponse } from "./flashcard-response.dto";

/**
 * Today's study round of one deck for the caller (MDRS-165): the cards waiting
 * for a repeat, then a few they have not started. Each card carries the
 * caller's own progress row (empty for a card never studied), so the page can
 * show the state badge ("Öğreniliyor") without a second request.
 */
export class FlashcardStudyRoundResponse {
  @ApiProperty({ type: [FlashcardResponse] })
  cards!: FlashcardResponse[];

  @ApiProperty({ description: "How many of `cards` are repeats that are due." })
  dueCount!: number;

  @ApiProperty({
    description: "How many of `cards` are cards the caller has not started.",
  })
  newCount!: number;
}
