import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsUUID } from "class-validator";
import { FlashcardProgressStatus } from "../domain/flashcard-progress-status.enum";

export class CreateFlashcardProgressDto {
  @ApiProperty()
  @IsUUID()
  flashcardId!: string;

  @ApiProperty({ enum: FlashcardProgressStatus })
  @IsEnum(FlashcardProgressStatus)
  status!: FlashcardProgressStatus;
}
