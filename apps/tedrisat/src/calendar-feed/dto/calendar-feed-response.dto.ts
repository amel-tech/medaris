import { ApiProperty } from "@nestjs/swagger";

export class CalendarFeedStatusResponse {
  @ApiProperty({
    description:
      "Whether the caller has a feed URL. The URL itself cannot be shown again: only its hash is stored.",
  })
  active!: boolean;

  @ApiProperty({
    type: String,
    format: "date-time",
    nullable: true,
    description: "When the current URL was issued; null without one.",
  })
  createdAt!: Date | null;
}

export class CalendarFeedLinkResponse {
  @ApiProperty({
    example: "https://tedris.medaris.app/calendar/Xk3…Q.ics",
    description: 'The feed as https — for Google Calendar\'s "From URL".',
  })
  url!: string;

  @ApiProperty({
    example: "webcal://tedris.medaris.app/calendar/Xk3…Q.ics",
    description: "The same feed as webcal — Apple Calendar subscribes to it.",
  })
  webcalUrl!: string;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: Date;
}
