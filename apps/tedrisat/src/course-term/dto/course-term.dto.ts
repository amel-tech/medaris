import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

export const TERM_MAX = 120;
export const TERM_ARABIC_MAX = 200;
export const TERM_MEANING_MAX = 2000;
export const TERM_EXAMPLE_MAX = 1000;

/** The most terms a course's glossary may hold. */
export const COURSE_TERMS_MAX = 1000;

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

/** An optional text: trimmed, and empty is the same as not given (null). */
const emptyAsNull = ({ value }: { value: unknown }) => {
  if (typeof value !== "string") return value;
  const text = value.trim();
  return text === "" ? null : text;
};

const TERM = "The term as the course says it, e.g. `mâzî`.";
const ARABIC = "The term's Arabic spelling, vowelled if the müderris wishes.";
const LEXICAL = "What the word means in the language (lügat manası).";
const TECHNICAL =
  "What it means as a term of the science (ıstılah manası). Plain text.";
const EXAMPLE = "An example of the term in use.";

export class CreateCourseTermDto {
  @ApiProperty({ minLength: 1, maxLength: TERM_MAX, description: TERM })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(TERM_MAX)
  term!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: TERM_ARABIC_MAX,
    description: ARABIC,
  })
  @Transform(emptyAsNull)
  @IsOptional()
  @IsString()
  @MaxLength(TERM_ARABIC_MAX)
  arabic?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: TERM_MEANING_MAX,
    description: LEXICAL,
  })
  @Transform(emptyAsNull)
  @IsOptional()
  @IsString()
  @MaxLength(TERM_MEANING_MAX)
  lexicalMeaning?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: TERM_MEANING_MAX,
    description: TECHNICAL,
  })
  @Transform(emptyAsNull)
  @IsOptional()
  @IsString()
  @MaxLength(TERM_MEANING_MAX)
  technicalMeaning?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: TERM_EXAMPLE_MAX,
    description: EXAMPLE,
  })
  @Transform(emptyAsNull)
  @IsOptional()
  @IsString()
  @MaxLength(TERM_EXAMPLE_MAX)
  example?: string | null;
}

export class UpdateCourseTermDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: TERM_MAX, description: TERM })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(TERM_MAX)
  term?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: TERM_ARABIC_MAX,
    description: ARABIC,
  })
  @Transform(emptyAsNull)
  @IsOptional()
  @IsString()
  @MaxLength(TERM_ARABIC_MAX)
  arabic?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: TERM_MEANING_MAX,
    description: LEXICAL,
  })
  @Transform(emptyAsNull)
  @IsOptional()
  @IsString()
  @MaxLength(TERM_MEANING_MAX)
  lexicalMeaning?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: TERM_MEANING_MAX,
    description: TECHNICAL,
  })
  @Transform(emptyAsNull)
  @IsOptional()
  @IsString()
  @MaxLength(TERM_MEANING_MAX)
  technicalMeaning?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: TERM_EXAMPLE_MAX,
    description: EXAMPLE,
  })
  @Transform(emptyAsNull)
  @IsOptional()
  @IsString()
  @MaxLength(TERM_EXAMPLE_MAX)
  example?: string | null;
}

export class CourseTermResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  courseId!: string;

  @ApiProperty({ description: TERM })
  term!: string;

  @ApiProperty({ type: String, nullable: true, description: ARABIC })
  arabic!: string | null;

  @ApiProperty({ type: String, nullable: true, description: LEXICAL })
  lexicalMeaning!: string | null;

  @ApiProperty({ type: String, nullable: true, description: TECHNICAL })
  technicalMeaning!: string | null;

  @ApiProperty({ type: String, nullable: true, description: EXAMPLE })
  example!: string | null;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiProperty({ type: Date })
  updatedAt!: Date;
}
