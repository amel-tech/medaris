import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { FlashcardType } from "../domain/flashcard-type.enum";

export class CreateFlashcardDeckDto {
  @ApiProperty({ example: "Colours - Vocabulary Deck" })
  @IsString()
  @MinLength(5)
  @MaxLength(100)
  title!: string;

  // No `isPublic` (MDRS-148): a deck is born private, and going public is a
  // request only the başnazım answers (`POST /flashcard/decks/:id/publish-request`).
  // The validation pipe forbids unknown properties, so a body that still
  // carries the flag, true or false, is a 400 on POST, PUT and PATCH alike.

  @ApiPropertyOptional({
    enum: FlashcardType,
    enumName: "FlashcardType",
    default: FlashcardType.VOCABULARY,
    description: "What the deck's cards are; fixed once the deck exists.",
  })
  @IsOptional()
  @IsEnum(FlashcardType)
  cardType?: FlashcardType;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 20,
    description:
      "Free labels, trimmed and de-duplicated by the server. Only the author reads them back.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
