import { ApiProperty } from "@nestjs/swagger";

export class CourseBadgeCountsResponse {
  @ApiProperty({
    example: 1,
    description:
      "Live sessions still ahead whose meeting link is empty. A cancelled or hidden session is not counted.",
  })
  missingMeetingLinks!: number;

  @ApiProperty({
    example: 2,
    description: "Enrollment requests waiting for approval.",
  })
  pendingApplications!: number;
}
