import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional } from "class-validator";
import {
  KOSK_DESCRIPTION_MAX,
  KOSK_FIELD_MAX,
  KOSK_HANDLE_MAX,
  KOSK_HUE_MAX,
  KOSK_LEVELS,
  KOSK_NAME_MAX,
  KOSK_NAME_MIN,
  KOSK_TAG_MAX,
  KOSK_TAGS_MAX,
  KoskCoverHueRules,
  KoskDescriptionRules,
  KoskFieldRules,
  KoskHandleRules,
  KoskIsPrivateRules,
  type KoskLevel,
  KoskLevelRules,
  KoskNameRules,
  KoskTagsRules,
  OmittedButNotNull,
} from "./kosk-field-rules";

export class CreateKoskDto {
  @ApiProperty({
    example: "Süleymaniye Köşkü",
    minLength: KOSK_NAME_MIN,
    maxLength: KOSK_NAME_MAX,
  })
  @KoskNameRules()
  name!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "@suleymaniye",
    maxLength: KOSK_HANDLE_MAX,
  })
  @IsOptional()
  @KoskHandleRules()
  handle?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example:
      "Klasik medrese müfredatına dayalı; sarf, nahiv ve usûl-i fıkıh dersleri sunan köşk.",
    maxLength: KOSK_DESCRIPTION_MAX,
  })
  @IsOptional()
  @KoskDescriptionRules()
  description?: string | null;

  @ApiPropertyOptional({
    example: 215,
    minimum: 0,
    maximum: KOSK_HUE_MAX,
    description: "Hue of the köşk's cover gradient, in degrees",
  })
  @OmittedButNotNull()
  @KoskCoverHueRules()
  coverHue?: number;

  @ApiPropertyOptional({ example: true })
  @OmittedButNotNull()
  @KoskIsPrivateRules()
  isPrivate?: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "Tefsir & Hadis",
    description: "İlim alanı; null clears it",
    maxLength: KOSK_FIELD_MAX,
  })
  @IsOptional()
  @KoskFieldRules()
  field?: string | null;

  @ApiPropertyOptional({
    enum: KOSK_LEVELS,
    enumName: "KoskLevel",
    nullable: true,
    example: "ALL",
    description: "Who the köşk is for; null clears it",
  })
  @IsOptional()
  @KoskLevelRules()
  level?: KoskLevel | null;

  @ApiPropertyOptional({
    type: [String],
    example: ["Tefsir", "Hadis"],
    maxItems: KOSK_TAGS_MAX,
    description: `At most ${KOSK_TAGS_MAX} distinct, non-blank tags of up to ${KOSK_TAG_MAX} characters`,
  })
  @OmittedButNotNull()
  @KoskTagsRules()
  tags?: string[];
}
