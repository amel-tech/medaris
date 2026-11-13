import { ForbiddenError } from "@medaris/common";

/**
 * A talebe's mark on a memorisation homework (MDRS-248) is read by that
 * talebe while the course is open to them, as their own homework is. The
 * message names no course.
 */
export class EvaluationForbiddenError extends ForbiddenError {
  static readonly code = "EVALUATION_FORBIDDEN";

  constructor() {
    super(
      EvaluationForbiddenError.code,
      "A mark on a homework is read by the talebe it was given to"
    );
  }
}
