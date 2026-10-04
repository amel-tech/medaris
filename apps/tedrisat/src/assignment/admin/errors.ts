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

/**
 * A seat the act drops belongs to someone who handed on roles or permissions
 * of their own that are still held under it, and that no other seat of theirs
 * backs (owner, d-1004: whoever loses a role, the remover decides each row
 * they gave). Those rows are not asked about in this act, so the seat is not
 * dropped here: dismiss its holder first, where every row they gave is
 * listed, or take the seat over.
 */
export class DismissSeatHandedOnError extends ConflictError {
  static readonly code = "DISMISS_SEAT_HANDED_ON";

  constructor(userIds: readonly string[], context?: ErrorContext) {
    super(
      DismissSeatHandedOnError.code,
      `Dismiss ${userIds.join(", ")} first: what they handed on is still held under the seat`,
      { userIds: [...userIds], ...context }
    );
  }
}

/**
 * A grant answered TAKE_OVER whose holder loses, in the same act, the seat it
 * hangs on: it would be a permission with no role behind it (owner, 3
 * October). Answer the grant DROP, or keep the seat.
 */
export class DismissTakeOverWithoutSeatError extends BadRequestError {
  static readonly code = "DISMISS_TAKE_OVER_WITHOUT_SEAT";

  constructor(grantIds: readonly string[], context?: ErrorContext) {
    super(
      DismissTakeOverWithoutSeatError.code,
      "A grant taken over cannot outlast the seat dropped beside it",
      { grantIds: [...grantIds], ...context }
    );
  }
}
