import { ApiProperty } from "@nestjs/swagger";

export class MadrasahBadgeCountsResponse {
  @ApiProperty({
    example: 3,
    description:
      "Enrollment requests waiting for approval across the medrese's courses. A hidden course is not counted.",
  })
  pendingApplications!: number;

  @ApiProperty({
    example: 2,
    description:
      "How many of the medrese's courses hold at least one pending request.",
  })
  coursesWithPendingApplications!: number;
}
