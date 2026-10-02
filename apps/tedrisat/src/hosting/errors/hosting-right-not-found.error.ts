import { ErrorContext, NotFoundError } from "@medaris/common";

export class HostingRightNotFoundError extends NotFoundError {
  static readonly code = "HOSTING_RIGHT_NOT_FOUND";

  constructor(koskId: string, madrasahId: string, context?: ErrorContext) {
    super(
      HostingRightNotFoundError.code,
      `Medrese ${madrasahId} holds no hosting right in köşk ${koskId}`,
      context
    );
  }
}
