import { ILogger, LOGGER } from "@medaris/common";
import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { AuthenticatedRequest } from "./interfaces/token-claims.interface";
import { identityFromClaims } from "./user-identity";
import { UserSyncService } from "./user-sync.service";

/**
 * Records the caller in `users` on every authenticated request (MDRS-104).
 *
 * Registered globally (`APP_INTERCEPTOR`). Interceptors run after guards, so
 * on a route behind `AuthGuard` the verified token is already on
 * `request.user`; on an unauthenticated route there is none and this does
 * nothing.
 *
 * The write is awaited before the handler runs, so a handler — `GET /me`
 * above all — reads the row the same request created. A failed write is
 * logged and the request carries on: the table is a directory of people, not
 * an authorization input, and a database hiccup here should not turn every
 * endpoint into a 500. The cache is left untouched on failure, so the next
 * request retries.
 */
@Injectable()
export class UserSyncInterceptor implements NestInterceptor {
  constructor(
    private readonly userSync: UserSyncService,
    @Inject(LOGGER) private readonly logger: ILogger
  ) {}

  // Returns a promise of the handler's stream rather than piping through
  // rxjs, which is not a direct dependency of this app; Nest accepts either.
  async intercept(
    context: ExecutionContext,
    next: CallHandler
  ): Promise<ReturnType<CallHandler["handle"]>> {
    if (context.getType() !== "http") return next.handle();

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const identity = identityFromClaims(request.user);
    if (!identity) return next.handle();

    try {
      await this.userSync.sync(identity);
    } catch (error: unknown) {
      // No `setContext`: LOGGER is one shared instance, so setting it here
      // would relabel every other class's log lines.
      this.logger.warn("UserSyncInterceptor: could not record the user", {
        userId: identity.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return next.handle();
  }
}
