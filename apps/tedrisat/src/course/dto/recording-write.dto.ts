import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { RecordingVisibility } from "../domain/recording";

/** What the release time is, said once for every route that takes it (MDRS-288). */
const AVAILABLE_AT =
  "When the session's talebe may watch its recording (MDRS-288), an ISO 8601 instant with its offset; the page enters it in the course's time zone. Kept on the session, so it outlives a recording that is replaced. `null` opens the recording as soon as it is READY. Whatever is set, a recording never opens before its session's scheduled start, so one may be added ahead of its session: a recording's `availableAt` is the later of the two. Before it, every read gives a talebe or a visitor the recording with this `availableAt` and a null `url`, and signs no Bunny link; the course team (`recording.manage`) plays it as before. \"Kayıt eklendi\" goes to the talebe at that moment, once: a time moved before it fires moves it, a time moved after it changes nothing.";

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

  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    example: "2026-10-14T17:00:00.000Z",
    description: `${AVAILABLE_AT} Written with the link, so a recording added for later is never open in between. Absent: the session's time stays as it is (null unless set before).`,
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  availableAt?: Date | null;
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

  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    example: "2026-10-14T17:00:00.000Z",
    description: `${AVAILABLE_AT} Absent: left as it is.`,
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  availableAt?: Date | null;
}

/**
 * `PUT /lessons/:id/recording-availability` (MDRS-288): the session's release
 * time, with or before a recording. The key is required: a missing key is a
 * 400, `null` opens the recording as soon as it is READY.
 *
 * The validators below are what require it. The OpenAPI document marks it
 * optional on purpose: for a required nullable date, openapi-generator's
 * typescript-fetch serialiser calls `toISOString()` on `null` and throws, so
 * nazar could never send "Hazır olunca hemen". An optional one gets the null
 * check, as on the Create and Update DTOs above.
 */
export class SetRecordingAvailabilityDto {
  @ApiProperty({
    type: Date,
    nullable: true,
    required: false,
    example: "2026-10-14T17:00:00.000Z",
    description: `${AVAILABLE_AT} The key must be sent: a body without it is 400.`,
  })
  @ValidateIf((_: unknown, value: unknown) => value !== null)
  @Type(() => Date)
  @IsDate()
  availableAt!: Date | null;
}

/** A session's recording release time, as the course team set it (MDRS-288). */
export class RecordingAvailabilityResponse {
  @ApiProperty({ format: "uuid" })
  lessonId!: string;

  @ApiProperty({
    type: Date,
    nullable: true,
    description:
      "When the session's talebe may watch its recording, as the course team set it; null: as soon as it is READY. Never before the session's scheduled start, which the recording's own `availableAt` takes into account.",
  })
  recordingAvailableAt!: Date | null;
}
