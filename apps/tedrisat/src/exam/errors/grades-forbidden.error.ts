import { ForbiddenError } from "@medaris/common";

/**
 * "Notlarım" (MDRS-248) is read by a talebe of the course while it is open to
 * them, as their own homework is. The message names no course.
 */
export class GradesForbiddenError extends ForbiddenError {
  static readonly code = "GRADES_FORBIDDEN";

  constructor() {
    super(
      GradesForbiddenError.code,
      "Grades are read by the talebe they belong to"
    );
  }
}
