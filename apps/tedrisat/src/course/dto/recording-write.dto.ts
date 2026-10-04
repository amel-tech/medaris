import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { RecordingVisibility } from "../domain/recording";

const HTTPS_ONLY = {
  require_protocol: true,
  protocols: ["https"],
};
const HTTPS_MESSAGE = { message: "$property must be an https:// URL" };

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

/** Optional, but never null: `@IsOptional()` would let `null` through to a NOT NULL column. */
const OmittedButNotNull = () =>
  ValidateIf((_: unknown, value: unknown) => value !== undefined);

/** `POST /lessons/:id/recordings`: a pasted link, with a title and who may watch. */
export class CreateRecordingDto {
  @ApiProperty({ example: "Hafta 3: Birinci celse", maxLength: 200 })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    example: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    maxLength: 500,
    description:
      "An https link to the recording. The provider (YOUTUBE, DRIVE, OTHER) is read off its host; no call is made to it.",
  })
  @Transform(trimmed)
  @IsUrl(HTTPS_ONLY, HTTPS_MESSAGE)
  @MaxLength(500)
  url!: string;

  @ApiPropertyOptional({
    enum: RecordingVisibility,
    enumName: "RecordingVisibility",
    default: RecordingVisibility.ENROLLED,
    description:
      "A YouTube link must be PUBLIC (RECORDING_YOUTUBE_PUBLIC_ONLY).",
  })
  @IsOptional()
  @IsEnum(RecordingVisibility)
  visibility?: RecordingVisibility;
}

/** `PATCH /recordings/:id`: only the keys that are present change. */
export class UpdateRecordingDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @OmittedButNotNull()
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    maxLength: 500,
    description:
      "A new https link; the provider is read again and the recording is READY.",
  })
  @OmittedButNotNull()
  @Transform(trimmed)
  @IsUrl(HTTPS_ONLY, HTTPS_MESSAGE)
  @MaxLength(500)
  url?: string;

  @ApiPropertyOptional({
    enum: RecordingVisibility,
    enumName: "RecordingVisibility",
  })
  @OmittedButNotNull()
  @IsEnum(RecordingVisibility)
  visibility?: RecordingVisibility;
}
