import {
  BadRequestError,
  ConflictError,
  type ErrorContext,
  NotFoundError,
} from "@medaris/common";

/** The person holds no Medaris nazımı role (or it has lapsed): MDRS-171. */
export class MedarisNazimNotFoundError extends NotFoundError {
  static readonly code = "MEDARIS_NAZIM_NOT_FOUND";

  constructor(userId: string, context?: ErrorContext) {
    super(
      MedarisNazimNotFoundError.code,
      `User ${userId} is not a Medaris nazımı`,
      context
    );
  }
}

export class MedarisNazimAlreadyAppointedError extends ConflictError {
  static readonly code = "MEDARIS_NAZIM_ALREADY_APPOINTED";

  constructor(userId: string, context?: ErrorContext) {
    super(
      MedarisNazimAlreadyAppointedError.code,
      `User ${userId} is already a Medaris nazımı`,
      context
    );
  }
}

export class PermissionGroupNotFoundError extends NotFoundError {
  static readonly code = "PERMISSION_GROUP_NOT_FOUND";

  constructor(groupId: string, context?: ErrorContext) {
    super(
      PermissionGroupNotFoundError.code,
      `No permission group with id ${groupId}`,
      context
    );
  }
}

export class PermissionGroupNameTakenError extends ConflictError {
  static readonly code = "PERMISSION_GROUP_NAME_TAKEN";

  constructor(name: string, context?: ErrorContext) {
    super(
      PermissionGroupNameTakenError.code,
      `A permission group named "${name}" exists`,
      context
    );
  }
}

/** A code outside the catalog of the scope it is used in. */
export class UnknownPermissionError extends BadRequestError {
  static readonly code = "PERMISSION_UNKNOWN";

  constructor(codes: string[], context?: ErrorContext) {
    super(
      UnknownPermissionError.code,
      `Not in this scope's catalog: ${codes.join(", ")}`,
      { codes, ...context }
    );
  }
}

export class PermissionGroupScopeError extends BadRequestError {
  static readonly code = "PERMISSION_GROUP_SCOPE_INVALID";

  constructor(message: string, context?: ErrorContext) {
    super(PermissionGroupScopeError.code, message, context);
  }
}

export class PermissionGroupEmptyError extends BadRequestError {
  static readonly code = "PERMISSION_GROUP_EMPTY";

  constructor(context?: ErrorContext) {
    super(
      PermissionGroupEmptyError.code,
      "A group holds at least one permission",
      context
    );
  }
}

/** A grant ends in the past, or after the appointment it hangs on. */
export class GrantExpiryInvalidError extends BadRequestError {
  static readonly code = "GRANT_EXPIRY_INVALID";

  constructor(message: string, context?: ErrorContext) {
    super(GrantExpiryInvalidError.code, message, context);
  }
}

/** The group has users and the request did not say what becomes of them. */
export class UsersPolicyRequiredError extends BadRequestError {
  static readonly code = "USERS_POLICY_REQUIRED";

  constructor(userCount: number, context?: ErrorContext) {
    super(
      UsersPolicyRequiredError.code,
      `${userCount} people use this group: say whether they keep their permissions`,
      { userCount, ...context }
    );
  }
}

/** Dismissal must decide every item the person handed on, and only those. */
export class DismissDecisionsError extends BadRequestError {
  static readonly code = "DISMISS_DECISIONS_INCOMPLETE";

  constructor(context?: ErrorContext) {
    super(
      DismissDecisionsError.code,
      "Decide every permission and role this person handed on, and nothing else",
      context
    );
  }
}
