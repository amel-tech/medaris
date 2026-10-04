import { ConflictError, ErrorContext } from "@medaris/common";

/** Taking a medrese out of service that is out of service already (MDRS-227). */
export class MadrasahAlreadyPassiveError extends ConflictError {
  static readonly code = "MADRASAH_ALREADY_PASSIVE";

  constructor(madrasahId: string, context?: ErrorContext) {
    super(
      MadrasahAlreadyPassiveError.code,
      `Medrese ${madrasahId} is passive already`,
      context
    );
  }
}
