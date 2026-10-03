import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SessionStatus } from "../domain/session-status.enum";
import { AgendaStepResponse } from "./course-response.dto";
import { SessionRecordingResponse } from "./recording-response.dto";

const CONTENT_FIELD =
  "Course content: absent unless the caller holds `view_details` on the course (MDRS-103).";

/** A neighbouring session: enough for a "previous / next" card. */
export class SessionRefResponse {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ description: "The week the session sits in." })
  weekNumber!: number;
  @ApiPropertyOptional({ type: Date, nullable: true }) startsAt!: Date | null;
  @ApiProperty({ enum: SessionStatus, enumName: "SessionStatus" })
  status!: SessionStatus;
}

export class SessionMuderrisResponse {
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({
    description: "True for the course's imam, the müderris the page badges.",
  })
  isImam!: boolean;
}

export class SessionResponse extends SessionRefResponse {
  @ApiProperty() courseId!: string;
  @ApiProperty() weekId!: string;
  @ApiProperty() weekTitle!: string;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: "Length in minutes; null when the müderris set none.",
  })
  durationMinutes!: number | null;
  @ApiPropertyOptional({ type: Date, nullable: true })
  cancelledAt!: Date | null;
  @ApiPropertyOptional({ type: String, description: CONTENT_FIELD })
  cancelReason?: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      "The session that makes up for a cancelled one; null when there is none or it is no longer in the programme.",
  })
  replacementSessionId!: string | null;
  @ApiPropertyOptional({ type: SessionRefResponse, nullable: true })
  replacement!: SessionRefResponse | null;
  @ApiPropertyOptional({ type: String, description: CONTENT_FIELD })
  kaynak?: string | null;
  @ApiPropertyOptional({
    type: [AgendaStepResponse],
    description: CONTENT_FIELD,
  })
  agenda?: AgendaStepResponse[] | null;
  @ApiPropertyOptional({
    type: String,
    description:
      CONTENT_FIELD +
      " Null once the session is cancelled or over: there is nothing left to join.",
  })
  meetingUrl?: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      CONTENT_FIELD +
      " The embeddable stream, sent only while the session is LIVE and only when one was set.",
  })
  liveStreamUrl?: string | null;
  @ApiPropertyOptional({
    type: SessionRecordingResponse,
    nullable: true,
    description:
      CONTENT_FIELD +
      " The session's recording, or null when it has none. Its `url` is null while it is PROCESSING.",
  })
  recording?: SessionRecordingResponse | null;
  @ApiPropertyOptional({
    type: SessionRefResponse,
    nullable: true,
    description: "The standing (not cancelled) session before this one.",
  })
  previous!: SessionRefResponse | null;
  @ApiPropertyOptional({
    type: SessionRefResponse,
    nullable: true,
    description: "The standing (not cancelled) session after this one.",
  })
  next!: SessionRefResponse | null;
  @ApiProperty({
    type: [SessionMuderrisResponse],
    description: "The course's müderrisler: public, like on the course page.",
  })
  muderris!: SessionMuderrisResponse[];
  @ApiProperty({
    description:
      "True when the caller lacks `view_details` and the content fields were removed.",
  })
  contentLocked!: boolean;
}
