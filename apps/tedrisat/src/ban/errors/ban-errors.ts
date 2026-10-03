import {
  BadRequestError,
  ConflictError,
  ErrorContext,
  ForbiddenError,
  NotFoundError,
} from "@medaris/common";

/** The caller may not place or see bans here (MDRS-177). */
export class BanForbiddenError extends ForbiddenError {
  static readonly code = "BAN_FORBIDDEN";

  constructor(
    message = "You may not manage bans here",
    context?: ErrorContext
  ) {
    super(BanForbiddenError.code, message, context);
  }
}

/** The ban was placed by a higher kademe than the caller's (MDRS-177). */
export class BanLiftForbiddenError extends ForbiddenError {
  static readonly code = "BAN_LIFT_FORBIDDEN";

  constructor(banId: string, context?: ErrorContext) {
    super(
      BanLiftForbiddenError.code,
      "Only the kademe that placed this ban, or a higher one, may lift it",
      { banId, ...context }
    );
  }
}

/** The talebe is barred: enrolling, leaving and progress are refused (MDRS-177). */
export class BanActiveError extends ForbiddenError {
  static readonly code = "BAN_ACTIVE";

  constructor(courseId: string, context?: ErrorContext) {
    super(BanActiveError.code, "You are barred from this course", {
      courseId,
      ...context,
    });
  }
}

export class BanNotFoundError extends NotFoundError {
  static readonly code = "BAN_NOT_FOUND";

  constructor(banId: string, context?: ErrorContext) {
    super(BanNotFoundError.code, `No ban with id ${banId}`, context);
  }
}

/** The ban was lifted already. */
export class BanAlreadyLiftedError extends ConflictError {
  static readonly code = "BAN_ALREADY_LIFTED";

  constructor(banId: string, context?: ErrorContext) {
    super(
      BanAlreadyLiftedError.code,
      `The ban ${banId} has been lifted already`,
      context
    );
  }
}

/** A ban on the banner themselves, or on someone who runs the course. */
export class BanTargetInvalidError extends BadRequestError {
  static readonly code = "BAN_TARGET_INVALID";

  constructor(message: string, context?: ErrorContext) {
    super(BanTargetInvalidError.code, message, context);
  }
}

/** The ban is not one a medrese widens: no open course ban in a medrese's course (MDRS-187). */
export class BanNotEscalatableError extends ConflictError {
  static readonly code = "BAN_NOT_ESCALATABLE";

  constructor(banId: string, context?: ErrorContext) {
    super(
      BanNotEscalatableError.code,
      `The ban ${banId} is not a course ban in a medrese's course`,
      context
    );
  }
}

/** The ban is not one a medrese asks to make permanent: a köşk's, or Medaris administration's own (MDRS-187). */
export class BanPermanentRequestInvalidError extends ConflictError {
  static readonly code = "BAN_PERMANENT_REQUEST_INVALID";

  constructor(banId: string, message: string, context?: ErrorContext) {
    super(BanPermanentRequestInvalidError.code, message, {
      banId,
      ...context,
    });
  }
}

/** The ban has a request for it to be permanent already (MDRS-187). */
export class BanPermanentRequestExistsError extends ConflictError {
  static readonly code = "BAN_PERMANENT_REQUEST_EXISTS";

  constructor(banId: string, context?: ErrorContext) {
    super(
      BanPermanentRequestExistsError.code,
      `The ban ${banId} has a request for it to be permanent already`,
      context
    );
  }
}
