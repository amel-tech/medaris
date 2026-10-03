import { ApiProperty } from "@nestjs/swagger";
import { SessionStatus } from "../../course/domain/session-status.enum";

/**
 * One live session of a course the caller is enrolled in: what Programım and
 * the phone menu's "Sıradaki celse" card draw.
 */
export class ScheduleSessionResponse {
  @ApiProperty() id!: string;
  @ApiProperty() courseId!: string;
  @ApiProperty() courseTitle!: string;
  @ApiProperty() koskId!: string;
  @ApiProperty() koskName!: string;
  @ApiProperty({ description: "The week the session sits in." })
  weekNumber!: number;
  @ApiProperty() title!: string;
  @ApiProperty({ type: Date }) startsAt!: Date;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: "Length in minutes; null when the müderris set none.",
  })
  durationMinutes!: number | null;
  @ApiProperty({
    enum: SessionStatus,
    enumName: "SessionStatus",
    description:
      "Derived from the clock and the cancellation, as on `GET /courses/:courseId/sessions/:sessionId`.",
  })
  status!: SessionStatus;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "The meeting link; null when none was added, and always null once the session is cancelled or over. Only an enrolled caller receives this response, so the link is theirs to read.",
  })
  meetingUrl!: string | null;
}
