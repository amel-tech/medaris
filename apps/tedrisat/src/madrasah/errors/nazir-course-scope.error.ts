import { BadRequestError, ErrorContext } from "@medaris/common";

/** The courses a nazır's course permissions were limited to do not fit the request. */
export class NazirCourseScopeError extends BadRequestError {
  static readonly code = "NAZIR_COURSE_SCOPE_INVALID";

  constructor(message: string, context?: ErrorContext) {
    super(NazirCourseScopeError.code, message, context);
  }
}
