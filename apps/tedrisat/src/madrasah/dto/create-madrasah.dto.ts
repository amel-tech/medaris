import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

/** Lower-case letters, digits and inner hyphens; 2–60 characters. */
export const MADRASAH_HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])$/;

export class CreateMadrasahDto {
  @ApiProperty({
    example: "hadis-ve-siyer",
    description:
      "Unique, URL-safe: lower-case letters, digits and inner hyphens, 2–60 characters",
  })
  @IsString()
  @Matches(MADRASAH_HANDLE_PATTERN)
  handle!: string;

  @ApiProperty({ example: "Hadis ve Siyer Araştırmaları Medresesi" })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    example:
      "Hadis ve siyer alanında klasik medrese usulüyle eğitim veren kurum.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 215, minimum: 0, maximum: 360 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(360)
  coverHue?: number;
}
