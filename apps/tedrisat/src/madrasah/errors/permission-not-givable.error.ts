import { ErrorContext, ForbiddenError } from "@medaris/common";

/**
 * Only the medrese's başmüderris and the Medaris başnazımı give permissions
 * and define groups: what a nazır was given cannot be handed on (nazir/06).
 * The course's ders nazırı route (MDRS-270) says its own reason.
 */
export class PermissionNotGivableError extends ForbiddenError {
  static readonly code = "PERMISSION_NOT_GIVABLE";

  constructor(context?: ErrorContext, message?: string) {
    super(
      PermissionNotGivableError.code,
      message ??
        "Only the medrese's başmüderris gives permissions or defines permission groups",
      context
    );
  }
}
