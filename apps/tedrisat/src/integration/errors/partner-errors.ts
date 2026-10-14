import {
  ConflictError,
  type ErrorContext,
  ForbiddenError,
  NotFoundError,
} from "@medaris/common";
import type { PartnerRefusalReason } from "../domain/partner-enrollment";

/**
 * The token is a partner client's, verified, but its service account lacks
 * the `partner-enrollment` realm role: a realm set-up the partner cannot fix
 * by retrying.
 */
export class PartnerRoleMissingError extends ForbiddenError {
  static readonly code = "PARTNER_ROLE_MISSING";

  constructor(context?: ErrorContext) {
    super(
      PartnerRoleMissingError.code,
      "The token does not carry the partner-enrollment realm role",
      context
    );
  }
}

/** No course is mapped to this code for this partner. */
export class PartnerCourseUnknownError extends NotFoundError {
  static readonly code = "PARTNER_COURSE_UNKNOWN";

  constructor(courseCode: string) {
    super(
      PartnerCourseUnknownError.code,
      `No course is mapped to the code ${courseCode}`,
      { courseCode }
    );
  }
}

/** The realm has no account with this id, or it may not sign in. */
export class PartnerUserUnknownError extends NotFoundError {
  static readonly code = "PARTNER_USER_UNKNOWN";

  constructor() {
    super(PartnerUserUnknownError.code, "No such account in the realm");
  }
}

/** The account's e-mail address is not verified. */
export class PartnerUserUnverifiedError extends ConflictError {
  static readonly code = "PARTNER_USER_UNVERIFIED";

  constructor() {
    super(
      PartnerUserUnverifiedError.code,
      "The account's e-mail address is not verified"
    );
  }
}

/** This registration and course code were linked to another person already. */
export class PartnerRegistrationUserMismatchError extends ConflictError {
  static readonly code = "PARTNER_REGISTRATION_USER_MISMATCH";

  constructor() {
    super(
      PartnerRegistrationUserMismatchError.code,
      "This registration and course code are linked to another user"
    );
  }
}

/** tedrisat refused the seat; `context.reason` says why. */
export class PartnerEnrollmentRefusedError extends ConflictError {
  static readonly code = "PARTNER_ENROLLMENT_REFUSED";

  constructor(reason: PartnerRefusalReason) {
    super(
      PartnerEnrollmentRefusedError.code,
      `The enrollment was refused: ${reason}`,
      { reason }
    );
  }
}

/** Course staff named a partner application this server does not know. */
export class PartnerUnknownError extends NotFoundError {
  static readonly code = "PARTNER_UNKNOWN";

  constructor() {
    super(PartnerUnknownError.code, "No such partner application");
  }
}

/**
 * The code is mapped to another course already. The message names nothing
 * about that course: whoever maps codes here may not be able to see it.
 */
export class PartnerCodeTakenError extends ConflictError {
  static readonly code = "PARTNER_CODE_TAKEN";

  constructor() {
    super(
      PartnerCodeTakenError.code,
      "This code is already mapped to another course"
    );
  }
}
