import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsUUID,
} from "class-validator";
import {
  KOSK_DESCRIPTION_MAX,
  KOSK_FIELD_MAX,
  KOSK_HANDLE_MAX,
  KOSK_HUE_MAX,
  KOSK_LEVELS,
  KOSK_MANAGERS_MAX,
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
  KoskPolicyRules,
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

  @ApiPropertyOptional({
    example: false,
    default: false,
    description:
      "Unlisted (MDRS-122): in no list or search, opened by its link to signed-in callers only (404 without a token), and every enrollment in its courses waits for approval. New köşks are listed unless this says otherwise.",
  })
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

  @ApiPropertyOptional({
    example: false,
    default: false,
    description:
      "Köşk-wide policy (MDRS-174): every enrollment in any course of the köşk waits for approval, whatever the course says.",
  })
  @OmittedButNotNull()
  @KoskPolicyRules()
  alwaysRequireApproval?: boolean;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description:
      "Köşk-wide policy (MDRS-174): no recording of the köşk is opened to everyone or uploaded to YouTube. Stored for the recording model; nothing reads it yet.",
  })
  @OmittedButNotNull()
  @KoskPolicyRules()
  recordingsNeverPublic?: boolean;

  @ApiPropertyOptional({
    type: [String],
    format: "uuid",
    minItems: 1,
    maxItems: KOSK_MANAGERS_MAX,
    description:
      "nizam/10: the köşk's first nazımları, found by e-mail (`GET /users/lookup`). SYSTEM_ADMIN only; when given, they are the köşk's nazımları and the caller is not one. Omitted: the caller becomes the köşk's only nazım, as before.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(KOSK_MANAGERS_MAX)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  managerUserIds?: string[];
}
