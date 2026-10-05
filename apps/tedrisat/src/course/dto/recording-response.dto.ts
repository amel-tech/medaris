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
      "Null unless the recording is READY. For a BUNNY recording (MDRS-116) it is the Bunny player link, built when it is read, with a token that expires after a few hours when the library uses token authentication.",
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
  @ApiPropertyOptional({ type: String, nullable: true })
  url!: string | null;
  @ApiProperty({ enum: RecordingVisibility, enumName: "RecordingVisibility" })
  visibility!: RecordingVisibility;
  @ApiProperty({ enum: RecordingStatus, enumName: "RecordingStatus" })
  status!: RecordingStatus;
}
