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

/** A zeroth question as it was last saved. */
export class ZerothQuestionText {
  @ApiProperty() text!: string;

  @ApiProperty({ type: [String], description: "In their order." })
  options!: string[];

  @ApiProperty({ type: String, format: "date-time" })
  updatedAt!: string;
}

/** Which question a course's exams ask. */
export enum ZerothQuestionSource {
  /** The course's own. */
  COURSE = "COURSE",
  /** The medrese's, the default. */
  MADRASAH = "MADRASAH",
  /** Neither: no exam of the course can be published. */
  NONE = "NONE",
}

/**
 * A course's zeroth question as its Sınavlar page reads it (MDRS-299): its own,
 * its medrese's, and which one its exams ask. The owner, 22 Nov 2026:
 * "ders özelinde sıfırıncı soru mümkün olsun, medreseninki default olur ders
 * özelinde değişebilir".
 */
export class CourseZerothQuestionResponse {
  @ApiProperty({
    type: () => ZerothQuestionText,
    nullable: true,
    description: "The course's own question; null while it asks its medrese's.",
  })
  own!: ZerothQuestionText | null;

  @ApiProperty({
    type: () => ZerothQuestionText,
    nullable: true,
    description:
      "The medrese's question, the default; null when the medrese has none, or the course belongs to a köşk alone.",
  })
  madrasah!: ZerothQuestionText | null;

  @ApiProperty({
    enum: ZerothQuestionSource,
    enumName: "ZerothQuestionSource",
    description: "Which one the course's exams ask as they are published.",
  })
  applies!: ZerothQuestionSource;

  @ApiProperty({
    description:
      "False for a course of a köşk alone: it has no medrese's question to fall back on.",
  })
  inMadrasah!: boolean;
}
