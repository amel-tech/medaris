import { ApiProperty } from "@nestjs/swagger";
import { MadrasahCourseKoskResponse } from "../../course/dto/madrasah-course.dto";

export class MadrasahStudentCourseResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Bina ve İzhar Şerhi" })
  title!: string;

  @ApiProperty({
    type: String,
    format: "date-time",
    nullable: true,
    description:
      "For a completed course, when the course team marked it completed; null for a course still ongoing, and for a completion recorded before the date was kept",
  })
  completedAt!: Date | null;
}

export class MadrasahStudentResponse {
  @ApiProperty({ format: "uuid" })
  userId!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: "Sümeyye Nur Ekincioğlu",
  })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({
    type: String,
    format: "date-time",
    description:
      'The earliest enrollment in any course of the medrese: "İlk kayıt"',
  })
  firstEnrolledAt!: Date;

  @ApiProperty({
    type: () => MadrasahStudentCourseResponse,
    isArray: true,
    description:
      '"Devam ettiği dersler": the courses of the medrese they are enrolled in, by title',
  })
  ongoingCourses!: MadrasahStudentCourseResponse[];

  @ApiProperty({
    type: () => MadrasahStudentCourseResponse,
    isArray: true,
    description: '"Tamamladığı dersler": by title; empty is "Yok"',
  })
  completedCourses!: MadrasahStudentCourseResponse[];
}

export class MadrasahStudentsResponse {
  @ApiProperty({ type: () => MadrasahStudentResponse, isArray: true })
  items!: MadrasahStudentResponse[];

  @ApiProperty({
    description: 'Talebe matching the filters, over every page: "48 talebe"',
  })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}

export class DashboardSessionResponse {
  @ApiProperty({ format: "uuid" })
  lessonId!: string;

  @ApiProperty({ format: "uuid" })
  courseId!: string;

  @ApiProperty({ example: "İsâgûcî ile mantığa giriş" })
  courseTitle!: string;

  @ApiProperty({ description: "For the course's colour swatch" })
  courseCoverHue!: number;

  @ApiProperty({ format: "uuid" })
  koskId!: string;

  @ApiProperty({ example: "Fatih Köşkü" })
  koskName!: string;

  @ApiProperty({ example: 2, description: '"Hafta 2"' })
  weekNumber!: number;

  @ApiProperty({ type: String, format: "date-time" })
  scheduledAt!: Date;

  @ApiProperty({
    type: String,
    nullable: true,
    example: "meet.google.com",
    description:
      'The host of the session\'s meeting link, never the link: the client names the platform from it. Null when the session has no link ("bağlantısı eksik")',
  })
  meetingHost!: string | null;
}

export class DashboardApplicationResponse {
  @ApiProperty({ format: "uuid" })
  courseId!: string;

  @ApiProperty()
  courseTitle!: string;

  @ApiProperty({ format: "uuid" })
  userId!: string;

  @ApiProperty({ type: String, nullable: true })
  studentName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  studentEmail!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  appliedAt!: Date;

  @ApiProperty({
    description:
      "Whether the caller may approve or reject this application with `POST /courses/:id/enrollments/:userId/approve` and `DELETE /courses/:id/enrollments/:userId`: the course's müderris, its köşk's nazım, or the başnazım. A başmüderris who is none of these gets 403 from those routes, so the row shows no buttons for them",
  })
  viewerMayDecide!: boolean;
}

export class MadrasahDashboardResponse {
  @ApiProperty({
    description:
      '"{n} medrese nazırı": the nazırs held, the başmüderris not among them',
  })
  nazirCount!: number;

  @ApiProperty({
    description:
      '"{n} medrese dersi": the medrese\'s courses that are not hidden, drafts included',
  })
  courseCount!: number;

  @ApiProperty({
    type: () => MadrasahCourseKoskResponse,
    isArray: true,
    description:
      '"Barındırma hakkı olan köşkler": the same list as `GET /madrasahs/:id/hosting-kosks`',
  })
  hostingKosks!: MadrasahCourseKoskResponse[];

  @ApiProperty({
    type: () => DashboardSessionResponse,
    isArray: true,
    description:
      "\"Yaklaşan celseler\": the live sessions of the medrese's published courses in the next 7 days, soonest first. Cancelled and hidden sessions, and hidden and draft courses, are left out, so the count in the greeting is this array's length",
  })
  upcomingSessions!: DashboardSessionResponse[];

  @ApiProperty({
    description:
      "Every pending application across the medrese's courses; the greeting's \"{m} başvuru\". `pendingApplications` carries at most 50 of them",
  })
  pendingApplicationCount!: number;

  @ApiProperty({
    description: 'In how many courses they wait: "{n} başvuru · {m} derste"',
  })
  pendingCourseCount!: number;

  @ApiProperty({
    type: () => DashboardApplicationResponse,
    isArray: true,
    description:
      '"Bekleyen başvurular": newest first, at most 50. The count above is the true number when there are more',
  })
  pendingApplications!: DashboardApplicationResponse[];
}
