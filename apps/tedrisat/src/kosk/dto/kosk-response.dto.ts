import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** The medrese a köşk is affiliated with (MDRS-106). */
export class KoskMadrasahRef {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: "Hadis ve Siyer Medresesi" })
  name!: string;

  @ApiProperty({ example: "hadis-ve-siyer" })
  handle!: string;
}

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

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "The affiliated medrese's id; null for a standalone köşk",
  })
  madrasahId!: string | null;

  @ApiPropertyOptional({
    type: KoskMadrasahRef,
    nullable: true,
    description: "The affiliated medrese; null for a standalone köşk",
  })
  madrasah!: KoskMadrasahRef | null;

  @ApiProperty({ example: "Süleymaniye Köşkü" })
  name!: string;

  @ApiPropertyOptional({ type: String, example: "@suleymaniye" })
  handle!: string | null;

  @ApiPropertyOptional({ type: String })
  description!: string | null;

  @ApiProperty({ example: 215 })
  coverHue!: number;

  @ApiProperty({ example: true })
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
