import { ErrorContext, NotFoundError } from "@medaris/common";

/** Also what a person with no künye answers: until one is chosen there is no public profile. */
export class PublicProfileNotFoundError extends NotFoundError {
  static readonly code = "PUBLIC_PROFILE_NOT_FOUND";

  constructor(userId: string, context?: ErrorContext) {
    super(
      PublicProfileNotFoundError.code,
      `User ${userId} has no public profile`,
      context
    );
  }
}
