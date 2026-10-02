import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class KoskResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({
    description:
      "Who created the köşk. Grants nothing since MDRS-126 — see managerIds",
  })
  ownerId!: string;

  @ApiProperty({
    type: [String],
    description: "Who manages the köşk, oldest first; never empty (MDRS-126)",
  })
  managerIds!: string[];

  @ApiProperty({ example: "Süleymaniye Köşkü" })
  name!: string;

  @ApiPropertyOptional({ type: String, example: "@suleymaniye" })
  handle!: string | null;

  @ApiPropertyOptional({ type: String })
  description!: string | null;

  @ApiProperty({ example: 215 })
  coverHue!: number;

  @ApiProperty({
    example: false,
    description:
      "Unlisted (MDRS-122): in no list or search, opened by its link to signed-in callers only, and every enrollment in its courses waits for approval.",
  })
  isPrivate!: boolean;

  @ApiPropertyOptional({ type: String, example: "Tefsir & Hadis" })
  field!: string | null;

  @ApiPropertyOptional({ type: String, example: "ALL" })
  level!: string | null;

  @ApiProperty({ type: [String], example: ["Tefsir", "Hadis"] })
  tags!: string[];

  @ApiProperty({
    example: false,
    description: "Köşk-wide policy (MDRS-174): enrollment always waits",
  })
  alwaysRequireApproval!: boolean;

  @ApiProperty({
    example: false,
    description: "Köşk-wide policy (MDRS-174): no recording is made public",
  })
  recordingsNeverPublic!: boolean;

  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description:
      "Since when the köşk is hidden (MDRS-174); null while it is shown. Only its nazımları and SYSTEM_ADMIN can read a hidden köşk.",
  })
  archivedAt!: Date | null;

  @ApiProperty({ example: false })
  verified!: boolean;

  @ApiProperty({ example: false })
  featured!: boolean;

  @ApiProperty({ example: 4.8 })
  rating!: number;

  @ApiProperty({ example: 132 })
  ratingCount!: number;

  @ApiProperty({
    description: "Courses published under this köşk",
    example: 14,
  })
  courseCount!: number;

  @ApiProperty({ description: "Distinct enrolled talebe", example: 482 })
  studentCount!: number;

  @ApiProperty({ description: "Distinct müderris", example: 6 })
  muderrisCount!: number;

  @ApiProperty({ example: 240 })
  followerCount!: number;

  @ApiProperty({ description: "Whether the current talebe follows this köşk" })
  isFollowing!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
