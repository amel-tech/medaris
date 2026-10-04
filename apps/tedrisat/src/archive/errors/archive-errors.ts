import {
  ConflictError,
  ErrorContext,
  ForbiddenError,
  NotFoundError,
} from "@medaris/common";

/** The caller may not read or change this archive (MDRS-173). */
export class ArchiveForbiddenError extends ForbiddenError {
  static readonly code = "ARCHIVE_FORBIDDEN";

  constructor(
    message = "You may not use this archive",
    context?: ErrorContext
  ) {
    super(ArchiveForbiddenError.code, message, context);
  }
}

/**
 * A restore by a lower level than the one that hid it (MDRS-135; owner,
 * d-1003-07: "Elbette kademe var"): what a level hid, that level or any above
 * it brings back, the rule the bans already follow. Says both levels.
 */
export class ArchiveRestoreLevelError extends ForbiddenError {
  static readonly code = "ARCHIVE_RESTORE_LEVEL";

  constructor(hiddenAt: string, yourLevel: string, context?: ErrorContext) {
    super(
      ArchiveRestoreLevelError.code,
      `This was hidden at the ${hiddenAt} level; only that level or above brings it back (you act at the ${yourLevel} level)`,
      { hiddenAt, yourLevel, ...context }
    );
  }
}

/** No hidden item of that type and id: missing, shown, or a type with no storage yet. */
export class ArchiveItemNotFoundError extends NotFoundError {
  static readonly code = "ARCHIVE_ITEM_NOT_FOUND";

  constructor(type: string, id: string, context?: ErrorContext) {
    super(
      ArchiveItemNotFoundError.code,
      `No hidden ${type} with id ${id}`,
      context
    );
  }
}

/**
 * Restoring a week, a session or a course whose parent is still hidden would
 * bring back something nobody can reach. Restore the parent first.
 */
export class ArchiveParentHiddenError extends ConflictError {
  static readonly code = "ARCHIVE_PARENT_HIDDEN";

  constructor(type: string, id: string, context?: ErrorContext) {
    super(
      ArchiveParentHiddenError.code,
      `The ${type} ${id} sits under something that is still hidden; restore that first`,
      context
    );
  }
}
