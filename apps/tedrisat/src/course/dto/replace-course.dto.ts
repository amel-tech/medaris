import { ApiPropertyOptional, OmitType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from "class-validator";
import { CreateCourseDto, CreateMuderrisDto } from "./create-course.dto";

/**
 * The whole-course save. Unlike a course being opened it does not have to
 * carry the müderris list: left out, the team stays as it is (MDRS-136), and
 * the imam is changed only by `PUT /courses/:id/muderris`.
 */
export class ReplaceCourseDto extends OmitType(CreateCourseDto, [
  "muderris",
  "imamUserId",
] as const) {
  @ApiPropertyOptional({
    type: [CreateMuderrisDto],
    description:
      "Left out: the müderrisler are not touched. Sent: the list replaces the stored one, and a save that would leave the course with no müderris who has an account is refused (400 MUDERRIS_LIST_INVALID).",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMuderrisDto)
  muderris?: CreateMuderrisDto[];

  @ApiPropertyOptional({
    example: 3,
    minimum: 0,
    description:
      "The course `version` this form was loaded with. When sent, the save is " +
      "refused with 409 COURSE_VERSION_CONFLICT if anyone has written the " +
      "course since; reload and re-apply instead of overwriting their work.",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  version?: number;
}
