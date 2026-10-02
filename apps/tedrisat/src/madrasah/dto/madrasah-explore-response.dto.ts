import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class MadrasahExploreCourseResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ example: 215 }) coverHue!: number;
}

export class MadrasahExploreResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() handle!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      "The başmüderris's display name; null with none, or while that person has never signed in.",
  })
  headMuderrisName!: string | null;
  @ApiProperty({ description: "Courses listed under the medrese" })
  courseCount!: number;
  @ApiProperty({
    type: [MadrasahExploreCourseResponse],
    description: "The medrese's listed courses, by title",
  })
  courses!: MadrasahExploreCourseResponse[];
}
