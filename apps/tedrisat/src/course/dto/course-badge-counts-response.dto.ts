import { ApiProperty } from "@nestjs/swagger";

export class CourseBadgeCountsResponse {
  @ApiProperty({
    example: 1,
    description:
      "Live sessions still ahead that nobody can attend as they stand: no meeting link, no live stream and not held in person (MDRS-283). A cancelled or hidden session is not counted, nor is one already under way or over.",
  })
  sessionsWithoutAccess!: number;

  @ApiProperty({
    example: 2,
    description: "Enrollment requests waiting for approval.",
  })
  pendingApplications!: number;
}
