import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class MadrasahCourseMuderrisResponse {
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) title!: string | null;
  @ApiProperty() isImam!: boolean;
}

export class MadrasahCourseResponse {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  category!: string | null;
  @ApiProperty({ example: 215 }) coverHue!: number;
  @ApiProperty() koskId!: string;
  @ApiProperty() koskName!: string;
  @ApiProperty({ type: [MadrasahCourseMuderrisResponse] })
  muderris!: MadrasahCourseMuderrisResponse[];
  @ApiPropertyOptional({
    enum: ["PENDING", "ENROLLED", "COMPLETED"],
    nullable: true,
    description:
      "The caller's own enrollment in the course; null with no token or no enrollment.",
  })
  enrollmentStatus!: "PENDING" | "ENROLLED" | "COMPLETED" | null;
  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description:
      "The earliest session of the course that is still ahead; null when none is scheduled. The meeting link is never part of this response.",
  })
  nextSessionAt!: Date | null;
}

export class MadrasahKoskRefResponse {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class MadrasahHeadMuderrisResponse {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      "Display name from the users table; null while that person has never signed in.",
  })
  name!: string | null;
  @ApiProperty({ description: "How many of the medrese's courses they teach" })
  courseCount!: number;
}

export class MadrasahOverviewResponse {
  @ApiPropertyOptional({ type: MadrasahHeadMuderrisResponse, nullable: true })
  headMuderris!: MadrasahHeadMuderrisResponse | null;
  @ApiProperty({ type: [MadrasahCourseResponse] })
  courses!: MadrasahCourseResponse[];
  @ApiProperty({
    type: [MadrasahKoskRefResponse],
    description: "Only the köşks the medrese has a listed course in",
  })
  kosks!: MadrasahKoskRefResponse[];
}
