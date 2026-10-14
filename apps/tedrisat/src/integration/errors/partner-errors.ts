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

/**
 * The token is a registered partner's, verified, but the başnazım has
 * disabled the partner in nizam: nothing it sends is acted on until it is
 * enabled again.
 */
export class PartnerDisabledError extends ForbiddenError {
  static readonly code = "PARTNER_DISABLED";

  constructor(context?: ErrorContext) {
    super(
      PartnerDisabledError.code,
      "This partner application is disabled",
      context
    );
  }
}

/**
 * No course is mapped to this code for this partner, in a köşk the partner
 * works with: a code mapped in a köşk it has been unbound from since reads the
 * same as one never mapped.
 */
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

/**
 * A partner application this caller may not name here: none is registered
 * under the id, or, for course staff, it does not work with the course's
 * köşk or is disabled. Both read the same, so a köşk's staff learn nothing
 * about the partners of other köşks.
 */
export class PartnerUnknownError extends NotFoundError {
  static readonly code = "PARTNER_UNKNOWN";

  constructor() {
    super(PartnerUnknownError.code, "No such partner application");
  }
}

/** The başnazım registered a client id that is registered already. */
export class PartnerExistsError extends ConflictError {
  static readonly code = "PARTNER_EXISTS";

  constructor(clientId: string) {
    super(
      PartnerExistsError.code,
      `A partner application with the client id ${clientId} is registered already`,
      { clientId }
    );
  }
}

/**
 * The client id is one of the front-ends (`KEYCLOAK_ALLOWED_CLIENTS`). A
 * partner's token is accepted on `/integrations/*` alone and refused on every
 * other route, so registering a front-end would lock its people out.
 */
export class PartnerFrontEndClientError extends ConflictError {
  static readonly code = "PARTNER_FRONT_END_CLIENT";

  constructor(clientId: string) {
    super(
      PartnerFrontEndClientError.code,
      `${clientId} is one of the front-ends in KEYCLOAK_ALLOWED_CLIENTS, never a partner application`,
      { clientId }
    );
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
