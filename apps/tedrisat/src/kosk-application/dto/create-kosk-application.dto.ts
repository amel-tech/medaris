import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import { KOSK_APPLICATION_FIELDS } from "../../database/schema/kosk-application.schema";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

/** Digits with the separators people type: +90 5__ ___ __ __, (0212) 555-0101. */
export const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{5,18}[0-9]$/;

export class CreateKoskApplicationDto {
  @ApiProperty({ maxLength: 120, example: "Davutpaşa Köşkü" })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: KOSK_APPLICATION_FIELDS })
  @IsIn(KOSK_APPLICATION_FIELDS)
  field!: string;

  @ApiProperty({ maxLength: 500 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  summary!: string;

  @ApiProperty({ maxLength: 3000 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  reason!: string;

  @ApiProperty({ maxLength: 254, format: "email" })
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "+90 532 000 00 00",
  })
  @IsOptional()
  @Transform(trim)
  @Matches(PHONE_PATTERN)
  phone?: string | null;
}
