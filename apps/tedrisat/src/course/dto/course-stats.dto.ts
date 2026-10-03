import { ApiProperty } from "@nestjs/swagger";

export class CourseStatsResponse {
  @ApiProperty({ description: "Talebe with an active seat (Kayıtlı talebe)" })
  enrolledCount!: number;

  @ApiProperty({ description: "Applications waiting for a decision" })
  pendingCount!: number;

  @ApiProperty({ description: "Talebe who completed the course" })
  completedCount!: number;

  @ApiProperty({ description: "Weeks the programme has" })
  weekCount!: number;

  @ApiProperty({
    description:
      "Weeks that have begun: one of their live lessons is dated now or earlier (Devam eden hafta)",
  })
  startedWeekCount!: number;
}
