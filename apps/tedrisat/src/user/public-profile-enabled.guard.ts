import { CanActivate, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PublicProfileUnavailableError } from "./errors/public-profile-unavailable.error";

/**
 * Hides the public profile while `PUBLIC_PROFILE_ENABLED` is not `true`
 * (MDRS-141, the owner's order of 4 Oct: too early for the talebe's profile
 * page). A guard rather than the service's first line because it runs before
 * the pipes and the interceptors: a malformed id or body still answers the same
 * 404, and the user-sync interceptor writes no `users` row for a caller who
 * only came to look. It is listed after `AuthGuard`, so a request with no
 * token is still a 401 and the 404 is for signed-in callers, the başnazım
 * included.
 */
@Injectable()
export class PublicProfileEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (this.config.get<boolean>("publicProfile.enabled") !== true) {
      throw new PublicProfileUnavailableError();
    }
    return true;
  }
}
