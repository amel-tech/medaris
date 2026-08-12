import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "@nestjs/class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { FlashcardType } from "../domain/flashcard-type.enum";

export class CreateFlashcardDto {
  @ApiProperty({ enum: FlashcardType })
  @IsEnum(FlashcardType)
  type!: FlashcardType;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  contentFront!: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  contentBack!: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  contentMeta?: unknown;
}
