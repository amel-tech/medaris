import { ErrorContext, NotFoundError } from "@medaris/common";

/**
 * What every public-profile route answers while the profile is hidden
 * (MDRS-141). One code and no detail, so the answer does not say whether the
 * person has a profile.
 */
export class PublicProfileUnavailableError extends NotFoundError {
  static readonly code = "PUBLIC_PROFILE_UNAVAILABLE";

  constructor(context?: ErrorContext) {
    super(
      PublicProfileUnavailableError.code,
      "The public profile is not available",
      context
    );
  }
}
