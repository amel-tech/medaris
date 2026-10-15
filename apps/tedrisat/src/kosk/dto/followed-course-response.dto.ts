import type { HocaUnvan } from "@medaris/utils/src/hoca-unvan.js";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { HOCA_UNVAN_PROPERTY } from "../../course/dto/course-response.dto";

/**
 * A course of a köşk the caller follows, for Ana sayfa's "Takip ettiğin
 * köşklerden" (MDRS-165): enough for one line, no more.
 */
export class FollowedKoskCourseResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ format: "uuid" }) koskId!: string;
  @ApiProperty() koskName!: string;
  @ApiProperty({ description: "The cover's hue, 0–360." }) coverHue!: number;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "The first müderris by the order the course lists them in.",
  })
  muderrisName!: string | null;
  @ApiPropertyOptional({
    ...HOCA_UNVAN_PROPERTY,
    description:
      "That müderris' unvan in this course; null is none, shown as `{name} Hoca`.",
  })
  muderrisUnvan!: HocaUnvan | null;
  @ApiProperty({ description: "That müderris is the course's imam." })
  muderrisIsImam!: boolean;
  @ApiProperty({
    description:
      "How many müderrisler the course lists; the imam is marked only where there is more than one.",
  })
  muderrisCount!: number;
}
