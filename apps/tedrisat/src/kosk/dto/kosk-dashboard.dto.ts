import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export const DASHBOARD_SESSION_TABS = [
  "UPCOMING",
  "PAST",
  "CANCELLED",
] as const;
export type DashboardSessionTab = (typeof DASHBOARD_SESSION_TABS)[number];

export class KoskDashboardCountsResponse {
  @ApiProperty({ description: "Courses that are not hidden" })
  courses!: number;

  @ApiProperty({
    description:
      "Distinct talebe enrolled in the köşk's courses; hidden courses do not count",
  })
  students!: number;

  @ApiProperty({
    description:
      "Live sessions starting in the next seven days (Yaklaşan celse)",
  })
  upcomingSessions!: number;

  @ApiProperty({
    description: "Applications waiting in courses that are not hidden",
  })
  pendingApplications!: number;
}

export class KoskDashboardSessionCountsResponse {
  @ApiProperty({
    description: "Starting in the next seven days, not cancelled",
  })
  upcoming!: number;

  @ApiProperty({ description: "Already started, not cancelled" })
  past!: number;

  @ApiProperty({ description: "Cancelled, whenever they were to be held" })
  cancelled!: number;
}

export class DashboardSessionMuderrisResponse {
  @ApiProperty()
  name!: string;

  @ApiProperty({ description: "The course's imam" })
  isImam!: boolean;
}

export class KoskDashboardSessionResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  courseId!: string;

  @ApiProperty()
  courseTitle!: string;

  @ApiProperty({
    description: "The course's cover hue: the colour square beside its title",
  })
  courseCoverHue!: number;

  @ApiProperty({ description: "'Hafta 5': the week the session belongs to" })
  weekNumber!: number;

  @ApiProperty({ type: Date })
  scheduledAt!: Date;

  @ApiPropertyOptional({ type: Number, nullable: true })
  durationMinutes!: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      "Where talebe join. The köşk nazımı is the course team, so it is shown; null: no link yet (Bağlantı eksik). Absent when `contentLocked` is true.",
  })
  meetingUrl?: string | null;

  @ApiProperty({ description: "It makes up for a cancelled session (telafi)" })
  isMakeup!: boolean;

  @ApiProperty({ description: "Talebe enrolled in the course" })
  studentCount!: number;

  @ApiProperty({ type: Boolean, description: "Cancelled (İptal edildi)" })
  cancelled!: boolean;

  @ApiPropertyOptional({ type: String, nullable: true })
  madrasahName!: string | null;

  @ApiProperty({ type: DashboardSessionMuderrisResponse, isArray: true })
  muderris!: DashboardSessionMuderrisResponse[];
}

export class KoskDashboardApplicationResponse {
  @ApiProperty({ format: "uuid" })
  userId!: string;

  @ApiProperty({ format: "uuid" })
  courseId!: string;

  @ApiProperty()
  courseTitle!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  studentName!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "Absent when `contentLocked` is true",
  })
  studentEmail?: string | null;

  @ApiProperty({ type: Date })
  requestedAt!: Date;
}

export class KoskDashboardMuderrisResponse {
  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  userId!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: "Courses of this köşk they teach" })
  courseCount!: number;

  @ApiProperty({ description: "Distinct talebe enrolled in those courses" })
  studentCount!: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "The medrese they teach for, when one of their courses has it",
  })
  madrasahName!: string | null;
}

export class KoskDashboardResponse {
  @ApiProperty({ format: "uuid" })
  koskId!: string;

  @ApiProperty()
  koskName!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "The viewer's given name for the greeting; null when unknown",
  })
  greetingName!: string | null;

  @ApiProperty({ type: KoskDashboardCountsResponse })
  counts!: KoskDashboardCountsResponse;

  @ApiProperty({ type: KoskDashboardSessionCountsResponse })
  sessionCounts!: KoskDashboardSessionCountsResponse;

  @ApiProperty({
    description:
      "Sessions in the next seven days with no meeting link: the alert's reason",
  })
  missingLinkCount!: number;

  @ApiPropertyOptional({
    type: KoskDashboardSessionResponse,
    nullable: true,
    description:
      "The soonest of them: the alert names its course and day; null when none",
  })
  firstMissingLink!: KoskDashboardSessionResponse | null;

  @ApiProperty({
    enum: DASHBOARD_SESSION_TABS,
    enumName: "DashboardSessionTab",
    description: "Which tab `sessions` is the list of",
  })
  tab!: DashboardSessionTab;

  @ApiProperty({
    description:
      "True when the meeting links and the applicants' e-mail addresses were left out: the caller reads the page by `platform.kosk_edit` alone, which covers neither course content nor personal data",
  })
  contentLocked!: boolean;

  @ApiProperty({
    type: KoskDashboardSessionResponse,
    isArray: true,
    description:
      "UPCOMING: the next seven days, soonest first; PAST and CANCELLED: the latest twenty, newest first",
  })
  sessions!: KoskDashboardSessionResponse[];

  @ApiProperty({
    type: KoskDashboardApplicationResponse,
    isArray: true,
    description: "The newest waiting applications, five at most",
  })
  latestApplications!: KoskDashboardApplicationResponse[];

  @ApiProperty({ type: KoskDashboardMuderrisResponse, isArray: true })
  muderris!: KoskDashboardMuderrisResponse[];
}
