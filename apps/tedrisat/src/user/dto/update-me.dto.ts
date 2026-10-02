import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsLocale, IsOptional, IsTimeZone, MaxLength } from "class-validator";

/**
 * The two settings a user owns (MDRS-104). `null` clears one; an absent
 * field leaves it as it is.
 */
export class UpdateMeDto {
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
