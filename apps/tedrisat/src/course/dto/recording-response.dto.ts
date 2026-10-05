import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  RecordingProvider,
  RecordingStatus,
  RecordingVisibility,
} from "../domain/recording";

export class RecordingResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ description: "The session this is the recording of." })
  lessonId!: string;
  @ApiProperty() weekId!: string;
  @ApiProperty() weekNumber!: number;
  @ApiProperty() weekTitle!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ type: Date, nullable: true })
  recordedAt!: Date | null;
  @ApiPropertyOptional({ type: Number, nullable: true })
  durationMinutes!: number | null;
  @ApiProperty({ enum: RecordingProvider, enumName: "RecordingProvider" })
  provider!: RecordingProvider;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      "Null unless the recording is READY. For a BUNNY recording it is Bunny's player link, `https://player.mediadelivery.net/embed/<libraryId>/<videoId>?token=<token>&expires=<unix seconds>`, signed for this response only and only for a caller allowed to see the recording (MDRS-116, MDRS-119); its player page opens until `expires` (6 hours by default, `BUNNY_STREAM_EMBED_TTL_SECONDS`), even if passed on; whether the stream behind it stops too depends on the library's CDN token authentication (docs/migration/mdrs-119-signed-playback.md). Any other provider's link is returned as stored: anyone holding it can open it, so for those our authorization decides who is shown the link, not who can play it.",
  })
  url!: string | null;
  @ApiProperty({ enum: RecordingVisibility, enumName: "RecordingVisibility" })
  visibility!: RecordingVisibility;
  @ApiProperty({ enum: RecordingStatus, enumName: "RecordingStatus" })
  status!: RecordingStatus;
}

/** The recording a session page plays: the list entry without its place in the programme. */
export class SessionRecordingResponse {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ type: Date, nullable: true })
  recordedAt!: Date | null;
  @ApiPropertyOptional({ type: Number, nullable: true })
  durationMinutes!: number | null;
  @ApiProperty({ enum: RecordingProvider, enumName: "RecordingProvider" })
  provider!: RecordingProvider;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      "As `RecordingResponse.url`: a BUNNY recording's link is a player link signed for this response, with its own `expires`.",
  })
  url!: string | null;
  @ApiProperty({ enum: RecordingVisibility, enumName: "RecordingVisibility" })
  visibility!: RecordingVisibility;
  @ApiProperty({ enum: RecordingStatus, enumName: "RecordingStatus" })
  status!: RecordingStatus;
}
