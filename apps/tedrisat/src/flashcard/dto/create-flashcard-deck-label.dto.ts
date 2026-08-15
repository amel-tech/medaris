// `createdBy` is deliberately absent (MDRS-27) — see create-flashcard-label.dto.ts.
// The controller takes the actor from the verified token instead.
import {
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from "@nestjs/class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";
import { Scope } from "../domain/flashcard-label.enum";
export class CreateFlashcardDeckLabelDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(100)
  title!: string;

  @ApiProperty()
  @IsEnum(Scope)
  scope!: Scope;
}
export class CreateFlashcardDeckLabelingDto {
  @ApiProperty()
  @IsUUID()
  @IsString()
  labelId!: string;

  @ApiProperty()
  @IsOptional()
  @IsUUID()
  privateToUserId: string | null = null;

  @ApiProperty()
  @IsUUID()
  @IsString()
  deckId!: string;
}
