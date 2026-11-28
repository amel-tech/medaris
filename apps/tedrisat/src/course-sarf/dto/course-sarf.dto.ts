import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

/**
 * The bâbs and masdar vezins `@medaris/sarf` knows, pinned here by key: the
 * API does not load the engine (it only keeps what the müderris chose), and a
 * key the engine does not know would leave the talebe's page with no table.
 */
export const SARF_BABS = [
  "nasara",
  "daraba",
  "fataha",
  "semia",
  "hasune",
  "hasibe",
] as const;

export const SARF_MASDAR_VEZINS = [
  "fal",
  "feal",
  "ful",
  "fil",
  "fuul",
  "feale",
  "fuule",
  "fiale",
  "filan",
] as const;

export const SARF_MASTAR_MAX = 120;

/**
 * Three sâlim letters, a space between: no hamza, no weak letter (ا و ي ى), no
 * tâ marbûta. A doubled root (the second and third letter the same) is refused
 * by the service.
 */
const KOK = /^[بت-غف-ه]( [بت-غف-ه]){2}$/;

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value;

const emptyAsNull = ({ value }: { value: unknown }) => {
  if (typeof value !== "string") return value;
  const text = value.trim().replace(/\s+/g, " ");
  return text === "" ? null : text;
};

const KOK_DESCRIPTION =
  "The root, three sâlim Arabic letters with a space between. Sülâsî mücerred sâlim only: a hamza, a weak letter or a doubled root is refused.";

export class SaveCourseSarfRootDto {
  @ApiProperty({ example: "ن ص ر", description: KOK_DESCRIPTION })
  @Transform(trimmed)
  @IsString()
  @Matches(KOK, { message: "kok must be three sâlim Arabic letters" })
  kok!: string;

  @ApiProperty({ enum: SARF_BABS, example: "nasara" })
  @IsIn(SARF_BABS)
  bab!: (typeof SARF_BABS)[number];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: SARF_MASTAR_MAX,
    example: "yardım etmek",
    description:
      "The Turkish mastar the meaning templates are built on. Left out or empty, the tables show the Arabic alone.",
  })
  @Transform(emptyAsNull)
  @IsOptional()
  @IsString()
  @MaxLength(SARF_MASTAR_MAX)
  mastar?: string | null;

  @ApiProperty({
    enum: SARF_MASDAR_VEZINS,
    example: "fal",
    description:
      "The vezin of the masdar, which is semâî: the müderris confirms the one the engine offered or picks another.",
  })
  @IsIn(SARF_MASDAR_VEZINS)
  masdarVezin!: (typeof SARF_MASDAR_VEZINS)[number];
}

export class CourseSarfRootResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  courseId!: string;

  @ApiProperty({ example: "ن ص ر", description: KOK_DESCRIPTION })
  kok!: string;

  @ApiProperty({ enum: SARF_BABS })
  bab!: string;

  @ApiProperty({ type: String, nullable: true })
  mastar!: string | null;

  @ApiProperty({ enum: SARF_MASDAR_VEZINS })
  masdarVezin!: string;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiProperty({ type: Date })
  updatedAt!: Date;
}
