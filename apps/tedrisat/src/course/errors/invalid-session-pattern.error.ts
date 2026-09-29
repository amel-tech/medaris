import { BadRequestError } from "@medaris/common";
import { WeeklyPatternProblem } from "../domain/weekly-pattern";

/**
 * A weekly pattern that passes field validation but cannot be expanded: no
 * end, an end before the start, a day the calendar does not have, nothing to
 * generate, or more than a batch may write (MDRS-109). `problem` says which.
 */
export class InvalidSessionPatternError extends BadRequestError {
  static readonly code = "INVALID_SESSION_PATTERN";

  constructor(problem: WeeklyPatternProblem) {
    super(
      InvalidSessionPatternError.code,
      `The weekly pattern cannot be expanded: ${problem}`,
      { problem }
    );
  }
}
