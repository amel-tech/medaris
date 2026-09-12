import { IsString } from "@nestjs/class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Scope } from "../domain/flashcard-label.enum";
import {
  CreateFlashcardDeckLabelDto,
  CreateFlashcardDeckLabelingDto,
} from "./create-flashcard-deck-label.dto";
export class FlashcardDeckCreateLabelResponse extends CreateFlashcardDeckLabelDto {
  // See FlashcardCreateLabelResponse for why `id` is published.
  @ApiProperty()
  @IsString()
  declare id: string;
  @ApiProperty()
  @IsString()
  declare title: string;
  @ApiProperty()
  declare createdBy: string;
  @ApiProperty()
  declare scope: Scope;
  @ApiProperty()
  declare createdAt: Date;
}

export class FlashcardDeckLabelingResponse extends CreateFlashcardDeckLabelingDto {
  @ApiProperty()
  @IsString()
  declare labelId: string;
  @ApiProperty()
  @IsString()
  declare deckId: string;
  @ApiProperty()
  @IsString()
  declare createdBy: string;
}
export class FlashcardDeckLabelResponse {
  @ApiProperty()
  @IsString()
  declare id: string;
  @ApiProperty()
  @IsString()
  declare title: string;
  @ApiProperty()
  declare createdAt: Date;
  @ApiProperty()
  @IsString()
  declare createdBy: string;
  @ApiProperty()
  declare scope: Scope;
}
export class DeckLabelStatsResponse {
  @ApiProperty()
  @IsString()
  declare labelId: string;
  @ApiProperty()
  declare usageCount: number;
  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  declare lastUsedAt: Date | null;
}
