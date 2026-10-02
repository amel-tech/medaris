import { OmitType } from "@nestjs/swagger";
import { CreateLessonDto } from "./create-course.dto";

/** A single session added to a week; its id is always assigned server-side. */
export class CreateWeekLessonDto extends OmitType(CreateLessonDto, [
  "id",
] as const) {}
