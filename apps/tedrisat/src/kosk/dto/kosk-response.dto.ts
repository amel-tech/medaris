import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class KoskResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "Who created the köşk. Grants nothing since MDRS-126 — see managerIds. Null for a caller with no token (MDRS-160): a person's id is not for the public.",
  })
  ownerId!: string | null;

  @ApiProperty({
    type: [String],
    description:
      "Who manages the köşk, oldest first; never empty for a signed-in caller (MDRS-126). Empty for a caller with no token (MDRS-160), who gets `managerName` instead.",
  })
  managerIds!: string[];

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'The name of the köşk\'s oldest manager, shown as "Köşk nazımı" (MDRS-160). Null when that person has no name on file. Open to everyone, signed in or not.',
  })
  managerName!: string | null;

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
