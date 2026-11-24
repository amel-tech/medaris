import { BadRequestError, ErrorContext, NotFoundError } from "@medaris/common";

export class CourseSarfRootNotFoundError extends NotFoundError {
  static readonly code = "COURSE_SARF_ROOT_NOT_FOUND";

  constructor(rootId: string, context?: ErrorContext) {
    super(
      CourseSarfRootNotFoundError.code,
      `Sarf root with id ${rootId} not found`,
      context
    );
  }
}

export class CourseSarfRootDoubledError extends BadRequestError {
  static readonly code = "COURSE_SARF_ROOT_DOUBLED";

  constructor(context?: ErrorContext) {
    super(
      CourseSarfRootDoubledError.code,
      "A doubled root (muzâaf) is not conjugated: sülâsî mücerred sâlim only",
      context
    );
  }
}
