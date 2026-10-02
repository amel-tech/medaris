import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { FlashcardProgressStatus } from "../domain/flashcard-progress-status.enum";

export class FlashcardProgressResponse {
  @ApiProperty()
  flashcardId!: string;

  @ApiProperty({ enum: FlashcardProgressStatus })
  status!: FlashcardProgressStatus;

  @ApiProperty()
  userId!: string;

  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description:
      "When the card is due again (MDRS-165); null for a card nobody rated, which is due now if it is LEARNING.",
  })
  dueAt?: Date | null;

  @ApiPropertyOptional({
    description: "The days between the last two reviews; 0 before the first.",
  })
  intervalDays?: number;
}
