import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, ValidateIf } from "class-validator";

/**
 * `PUT /lessons/:id/live-stream` (MDRS-228). The key is required: a missing
 * key is a 400, `null` clears the link. Whether a string is a YouTube video is
 * the service's question (`parseYoutubeLiveUrl`), so the answer names the
 * reason (`LIVE_STREAM_URL_INVALID`, `problem`) instead of a field rule.
 */
export class SetLiveStreamDto {
  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: 500,
    example: "https://studio.youtube.com/video/dQw4w9WgXcQ/livestreaming",
    description:
      "A YouTube video link — `youtube.com/watch?v=`, `/live/`, `/embed/`, `youtu.be/` or the YouTube Studio `studio.youtube.com/video/<id>/…` link — stored as `https://www.youtube.com/live/<id>`. A channel link (`/@handle/live`, `/channel/…`) is refused: a video link is needed. `null` clears the link.",
  })
  @ValidateIf((_: unknown, value: unknown) => value !== null)
  @IsString()
  @MaxLength(500)
  liveStreamUrl!: string | null;
}

/** One session's live stream link, as the course staff see it (MDRS-228). */
export class LiveStreamResponse {
  @ApiProperty({ format: "uuid" })
  lessonId!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: "https://www.youtube.com/live/dQw4w9WgXcQ",
    description: "Always `https://www.youtube.com/live/<id>`, or null.",
  })
  liveStreamUrl!: string | null;
}
