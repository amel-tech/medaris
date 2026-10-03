import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, Min } from "class-validator";
import { CreateCourseDto } from "./create-course.dto";

export class ReplaceCourseDto extends CreateCourseDto {
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
