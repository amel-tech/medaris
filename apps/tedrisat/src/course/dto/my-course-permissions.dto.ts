import { ApiProperty } from "@nestjs/swagger";

export class MyCoursePermissionsResponse {
  @ApiProperty({
    type: [String],
    example: ["course.enroll", "course.view"],
    description:
      "Every permission code the caller holds in this course, sorted: the " +
      "relationship (enrolled, pending, or any signed-in caller), the roles " +
      "and grants they hold in the course and in the köşk and medrese above " +
      "it, cut by the policies and a passive scope. It is the decision the " +
      "routes make, so a code listed here is a code the course's routes will " +
      "accept, and one that is not listed is refused.",
  })
  permissions!: string[];

  @ApiProperty({
    description:
      "Whether the caller may read the course's talebe, which is what opens " +
      "the staff pages (`course.staff_read` is in `permissions`).",
  })
  staffRead!: boolean;
}
