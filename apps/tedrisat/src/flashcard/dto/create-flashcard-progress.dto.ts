import { IsEnum, IsUUID } from "@nestjs/class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { FlashcardProgressStatus } from "../domain/flashcard-progress-status.enum";

export class CreateFlashcardProgressDto {
  @ApiProperty()
  @IsUUID()
  flashcardId!: string;

  @ApiProperty({ enum: FlashcardProgressStatus })
  @IsEnum(FlashcardProgressStatus)
  status!: FlashcardProgressStatus;
}
