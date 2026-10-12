import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { LessonType } from "../domain/lesson-type.enum";
import { CreateLessonDto, CreateLessonResourceDto } from "./create-course.dto";

/**
 * Optional, but never null: `@IsOptional()` skips validation for `null` as
 * well as `undefined`, so a NOT NULL column declared with it would let
 * `{"title": null}` through to Postgres and answer 500 instead of 400. The
 * nullable columns (durationMinutes, kaynak, scheduledAt, meetingUrl, agenda) keep
 * `PartialType`'s `@IsOptional()`, where null means "clear the field".
 */
const OmittedButNotNull = () =>
  ValidateIf((_: unknown, value: unknown) => value !== undefined);

export class UpdateLessonDto extends PartialType(
  OmitType(CreateLessonDto, [
    "id",
    "title",
    "type",
    "isPreview",
    "resources",
  ] as const)
) {
  @ApiProperty({
    example: 3,
    minimum: 0,
    description:
      "The course `version` the caller last saw. A stale value is refused " +
      "with 409 COURSE_VERSION_CONFLICT.",
  })
  @IsInt()
  @Min(0)
  version!: number;

  @ApiPropertyOptional({ example: "Birinci babın îsâgûcîsi" })
  @OmittedButNotNull()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ enum: LessonType, example: LessonType.LIVE })
  @OmittedButNotNull()
  @IsEnum(LessonType)
  type?: LessonType;

  @ApiPropertyOptional({ example: false })
  @OmittedButNotNull()
  @IsBoolean()
  isPreview?: boolean;

  @ApiPropertyOptional({
    description:
      "Move the lesson to another week of the same course. The lesson keeps " +
      "its id; it is appended to the end of that week unless orderIndex is " +
      "also given.",
  })
  @OmittedButNotNull()
  @IsUUID()
  weekId?: string;

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @OmittedButNotNull()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  // Redeclared rather than inherited: `PartialType` would add `@IsOptional()`,
  // which lets null through, and null is not a list (MDRS-286).
  @ApiPropertyOptional({
    type: [CreateLessonResourceDto],
    description:
      "The session's own resources, in order (MDRS-286). Absent leaves them as they are; sent, the list replaces the stored one: a row whose `id` is one of this session's is kept and rewritten whole, any other row is added, and a stored row left out is removed (a file with its stored object, MDRS-287). Files are added through `POST /lessons/:id/resources/files`. Never null.",
  })
  @OmittedButNotNull()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLessonResourceDto)
  resources?: CreateLessonResourceDto[];
}
