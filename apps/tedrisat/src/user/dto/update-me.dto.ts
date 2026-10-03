import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsLocale,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
  MaxLength,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

/**
 * What a user owns about themselves (MDRS-104, MDRS-166). `null` clears the
 * time zone or the locale; an absent field leaves it as it is. The names cannot
 * be cleared, only replaced: Hesap requires both.
 */
export class UpdateMeDto {
  @ApiPropertyOptional({ maxLength: 100, example: "Zeynep Betül" })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  givenName?: string;

  @ApiPropertyOptional({ maxLength: 100, example: "Karahanlı" })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  familyName?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "Europe/Istanbul",
    description: "IANA time zone",
  })
  @IsOptional()
  @IsTimeZone()
  @MaxLength(64)
  timeZone?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "tr",
    description: "BCP 47 language tag",
  })
  @IsOptional()
  @IsLocale()
  @MaxLength(35)
  locale?: string | null;
}
