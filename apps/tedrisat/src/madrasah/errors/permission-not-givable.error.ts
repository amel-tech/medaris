import { ErrorContext, ForbiddenError } from "@medaris/common";

/**
 * Only the medrese's başmüderris and the Medaris başnazımı give permissions
 * and define groups: what a nazır was given cannot be handed on (nazir/06).
 */
export class PermissionNotGivableError extends ForbiddenError {
  static readonly code = "PERMISSION_NOT_GIVABLE";

  constructor(context?: ErrorContext) {
    super(
      PermissionNotGivableError.code,
      "Only the medrese's başmüderris gives permissions or defines permission groups",
      context
    );
  }
}
