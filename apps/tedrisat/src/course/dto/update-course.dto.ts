import { ApiPropertyOptional, OmitType, PartialType } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsTimeZone, MaxLength, ValidateIf } from "class-validator";
import { CreateCourseDto, toCanonicalTimeZone } from "./create-course.dto";

// Course-level fields only; nested weeks/muderris/resources, and the imam a
// course is opened with, are managed separately.
export class UpdateCourseDto extends PartialType(
  OmitType(CreateCourseDto, [
    "weeks",
    "muderris",
    "imamUserId",
    "resources",
  ] as const)
) {
  // Redeclared because `PartialType` adds `@IsOptional()`, which lets null
  // through to the NOT NULL column (MDRS-110). Absent leaves the zone as it is.
  @ApiPropertyOptional({
    example: "Europe/Istanbul",
    description: "IANA time zone the course's sessions are authored in.",
  })
  @Transform(toCanonicalTimeZone)
  @ValidateIf((_: unknown, value: unknown) => value !== undefined)
  @IsTimeZone()
  @MaxLength(64)
  timeZone?: string;
}
