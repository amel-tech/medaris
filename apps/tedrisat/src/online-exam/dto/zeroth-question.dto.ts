import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import {
  ZEROTH_OPTION_MAX,
  ZEROTH_OPTIONS_MAX,
  ZEROTH_OPTIONS_MIN,
  ZEROTH_QUESTION_MAX,
} from "../domain/online-exam";

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
const trimmedEach = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((v) => (typeof v === "string" ? v.trim() : v))
    : value;

/** Medrese ayarları' "Sınavların sıfırıncı sorusu": the whole question, which replaces the one before. */
export class SaveZerothQuestionDto {
  @ApiProperty({
    minLength: 1,
    maxLength: ZEROTH_QUESTION_MAX,
    description: "The question about the hadith the page shows fixed.",
  })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(ZEROTH_QUESTION_MAX)
  text!: string;

  @ApiProperty({
    type: [String],
    minItems: ZEROTH_OPTIONS_MIN,
    maxItems: ZEROTH_OPTIONS_MAX,
    description:
      "Its options in their order, each different; none is correct and none carries points.",
  })
  @Transform(trimmedEach)
  @IsArray()
  @ArrayMinSize(ZEROTH_OPTIONS_MIN)
  @ArrayMaxSize(ZEROTH_OPTIONS_MAX)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(ZEROTH_OPTION_MAX, { each: true })
  options!: string[];
}

/** A medrese's zeroth question as Medrese ayarları reads it; empty while it has none. */
export class MadrasahZerothQuestionResponse {
  @ApiProperty({ description: "Empty while the medrese has no question." })
  text!: string;

  @ApiProperty({ type: [String], description: "In their order." })
  options!: string[];

  @ApiProperty({
    type: String,
    format: "date-time",
    nullable: true,
    description: "The last save; null while the medrese has no question.",
  })
  updatedAt!: string | null;
}
