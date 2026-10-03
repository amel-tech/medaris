import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsUUID, ValidateIf } from "class-validator";
import { FlashcardProgressStatus } from "../domain/flashcard-progress-status.enum";
import { ReviewRating } from "../domain/review-rating.enum";

export class CreateFlashcardProgressDto {
  @ApiProperty()
  @IsUUID()
  flashcardId!: string;

  @ApiPropertyOptional({
    enum: FlashcardProgressStatus,
    description:
      "The state to record. Required unless `rating` is sent; with a rating the server derives the state and the next review time and ignores this.",
  })
  @ValidateIf((dto: CreateFlashcardProgressDto) => dto.rating === undefined)
  @IsEnum(FlashcardProgressStatus)
  status?: FlashcardProgressStatus;

  @ApiPropertyOptional({
    enum: ReviewRating,
    enumName: "ReviewRating",
    description:
      "How hard the talebe found the card (MDRS-165). HARD and MEDIUM keep it LEARNING, EASY masters it; each sets when it is due again.",
  })
  @IsOptional()
  @IsEnum(ReviewRating)
  rating?: ReviewRating;
}
