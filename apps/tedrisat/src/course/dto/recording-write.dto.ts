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
      "An https link to the recording, read by its host with no call made to it (MDRS-119): a YouTube video link is YOUTUBE and is stored as its watch link; a player link of the Medaris Bunny library (`player.mediadelivery.net` or `iframe.mediadelivery.net`, `/embed/<libraryId>/<videoId>`) is BUNNY and only the video id is stored, its player link signed on every read; a Google Drive or Docs link is DRIVE and any other https link OTHER, both as pasted. A link that cannot be stored is 400 RECORDING_LINK_INVALID with a `reason`.",
  })
  @Transform(trimmed)
  @IsUrl(HTTPS_ONLY, HTTPS_MESSAGE)
  @MaxLength(500)
  url!: string;

  @ApiPropertyOptional({
    enum: RecordingVisibility,
    enumName: "RecordingVisibility",
    default: RecordingVisibility.ENROLLED,
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
      "A new https link, read as on `POST /lessons/:id/recordings`; the recording is READY. Moving between a Bunny video and any other link rewrites where the recording lives.",
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
