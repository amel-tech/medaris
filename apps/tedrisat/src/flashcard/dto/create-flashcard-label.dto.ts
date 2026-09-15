// `createdBy` and `userId` are deliberately absent (MDRS-27). They used to be
// required client-supplied fields, so any caller could attribute a label to
// another user. The controller now takes the actor from the verified token,
// and the global pipe's `forbidNonWhitelisted` turns an attempt to send them
// into a 400 rather than silently ignoring it.
import { ApiProperty } from "@nestjs/swagger";
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import { Scope } from "../domain/flashcard-label.enum";
export class CreateFlashcardLabelDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(100)
  title!: string;

  @ApiProperty()
  @IsEnum(Scope)
  scope!: Scope;
}
export class CreateFlashcardLabelingDto {
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
  flashcardId!: string;
}
