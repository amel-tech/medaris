import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import { FlashcardType } from "../domain/flashcard-type.enum";

/**
 * A course's deck, written by the course's staff (ders destesi). `weekId` is a
 * week of that course; `draft` keeps the deck from the talebe until it is
 * opened.
 */
export class CreateCourseDeckDto {
  @ApiProperty({ example: "Emsile - Kelime" })
  @IsString()
  @MinLength(5)
  @MaxLength(100)
  title!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({
    enum: FlashcardType,
    enumName: "FlashcardType",
    description: "What the deck's cards are; fixed once the deck exists.",
  })
  @IsEnum(FlashcardType)
  cardType!: FlashcardType;

  @ApiPropertyOptional({
    format: "uuid",
    description: "A week of the course. Omit it for a deck of no week.",
  })
  @IsOptional()
  @IsUUID()
  weekId?: string;

  @ApiPropertyOptional({
    default: false,
    description: "A draft is seen by the course's staff only.",
  })
  @IsOptional()
  @IsBoolean()
  draft?: boolean;
}

/**
 * Every field optional. `weekId: null` takes the deck out of its week; the
 * card type is not in the body, it is fixed at creation.
 */
export class UpdateCourseDeckDto {
  @ApiPropertyOptional({ minLength: 5, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  weekId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  draft?: boolean;
}

export class CreatedCourseDeckResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;
}

/** One deck of the course as its staff manage it. */
export class CourseDeckManageResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ enum: FlashcardType, enumName: "FlashcardType" })
  cardType!: FlashcardType;

  @ApiProperty()
  cardCount!: number;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  weekId!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  weekNumber!: number | null;

  @ApiProperty()
  draft!: boolean;

  @ApiProperty({
    minimum: 0,
    maximum: 1,
    description:
      "MASTERED card rows of the enrolled talebe, over cardCount x enrolledCount. 0 when either is 0.",
  })
  masteredRatio!: number;

  @ApiProperty()
  enrolledCount!: number;
}

/** One deck of the course as an enrolled talebe reads it, with their own progress. */
export class CourseDeckStudentResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ enum: FlashcardType, enumName: "FlashcardType" })
  cardType!: FlashcardType;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  weekId!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  weekNumber!: number | null;

  @ApiProperty()
  cardCount!: number;

  @ApiProperty()
  masteredCount!: number;

  @ApiProperty()
  learningCount!: number;

  @ApiProperty()
  newCount!: number;

  @ApiProperty({ description: "Cards waiting for a repeat today." })
  dueCount!: number;
}
