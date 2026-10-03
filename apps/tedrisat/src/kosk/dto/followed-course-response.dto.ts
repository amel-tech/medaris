import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

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
  @ApiProperty({ description: "That müderris is the course's imam." })
  muderrisIsImam!: boolean;
}
