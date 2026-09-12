// `createdBy` and `userId` are deliberately absent (MDRS-27). They used to be
// required client-supplied fields, so any caller could attribute a label to
// another user. The controller now takes the actor from the verified token,
// and the global pipe's `forbidNonWhitelisted` turns an attempt to send them
// into a 400 rather than silently ignoring it.
// The Swagger annotations here carry the validators' constraints deliberately.
// MDRS-58 regenerated the published contract from this file for the first time,
// and a bare `@ApiProperty()` publishes only what `design:type` can see: `scope`
// became an unconstrained `string` despite `@IsEnum(Scope)`, `title` lost its
// length bounds, and `privateToUserId` — typed `string | null` — reflected as
// `Object`, i.e. a required `{"type":"object"}` that no caller can satisfy with
// a UUID. A consumer generated from that contract typechecks clean and then
// takes a 400 from the global pipe.
import {
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from "@nestjs/class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";
import { Scope } from "../domain/flashcard-label.enum";
export class CreateFlashcardLabelDto {
  @ApiProperty({ minLength: 5, maxLength: 100 })
  @IsString()
  @MinLength(5)
  @MaxLength(100)
  title!: string;

  @ApiProperty({ enum: Scope })
  @IsEnum(Scope)
  scope!: Scope;
}
export class CreateFlashcardLabelingDto {
  @ApiProperty()
  @IsUUID()
  @IsString()
  labelId!: string;

  @ApiPropertyOptional({ type: String, nullable: true, format: "uuid" })
  @IsOptional()
  @IsUUID()
  privateToUserId: string | null = null;

  @ApiProperty()
  @IsUUID()
  @IsString()
  flashcardId!: string;
}
