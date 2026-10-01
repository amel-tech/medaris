import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from "@nestjs/swagger";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import { LessonType } from "../domain/lesson-type.enum";
import { CreateLessonDto } from "./create-course.dto";

/**
 * Optional, but never null: `@IsOptional()` skips validation for `null` as
 * well as `undefined`, so a NOT NULL column declared with it would let
 * `{"title": null}` through to Postgres and answer 500 instead of 400. The
 * nullable columns (duration, kaynak, scheduledAt, meetingUrl, agenda) keep
 * `PartialType`'s `@IsOptional()`, where null means "clear the field".
 */
const OmittedButNotNull = () =>
  ValidateIf((_: unknown, value: unknown) => value !== undefined);

export class UpdateLessonDto extends PartialType(
  OmitType(CreateLessonDto, ["id", "title", "type", "isPreview"] as const)
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
}
