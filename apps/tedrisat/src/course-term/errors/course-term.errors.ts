import { BadRequestError, ErrorContext, NotFoundError } from "@medaris/common";

export class CourseTermNotFoundError extends NotFoundError {
  static readonly code = "COURSE_TERM_NOT_FOUND";

  constructor(termId: string, context?: ErrorContext) {
    super(
      CourseTermNotFoundError.code,
      `Term with id ${termId} not found`,
      context
    );
  }
}

export class CourseTermsFullError extends BadRequestError {
  static readonly code = "COURSE_TERMS_FULL";

  constructor(max: number, context?: ErrorContext) {
    super(
      CourseTermsFullError.code,
      `A course's glossary holds at most ${max} terms`,
      context
    );
  }
}
