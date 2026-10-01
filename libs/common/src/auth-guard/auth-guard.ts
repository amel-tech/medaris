// auth/auth.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AUTHZ_PUBLIC_KEY } from "../authz/authz.decorator";
import { JWT_VERIFIER } from "./auth-guard.tokens";
import { IJwtVerifier } from "./interfaces/jwt-verifier.interface";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(JWT_VERIFIER) private readonly jwtVerifier: IJwtVerifier,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const authHeader = request.headers["authorization"];
    // MDRS-45: a handler marked `@AuthzPublic()` admits a caller with no
    // token, leaving `request.user` unset for `AuthzGuard` to decide on.
    // Only an ABSENT header takes this path. A header that is present —
    // empty, not `Bearer`, badly signed, expired — falls through to the same
    // verification as everywhere else and is a 401: an invalid token must
    // never be quietly read as anonymous.
    //
    // This is the guard's own decision rather than a separate
    // `OptionalAuthGuard` on the public handlers. The controller keeps its
    // one class-level `@UseGuards(AuthGuard, AuthzGuard)`, so a handler added
    // later without the marker is closed by default; moving the guards onto
    // each method would make a forgotten one an unauthenticated route.
    if (authHeader === undefined) {
      if (this.isPublic(context)) {
        return true;
      }
      throw new UnauthorizedException();
    }

    const [bearer, token] = String(authHeader).split(" ");
    if (bearer !== "Bearer" || !token) {
      throw new UnauthorizedException();
    }

    try {
      const decoded = await this.jwtVerifier.verifyToken(token);
      request.user = decoded;
      return true;
    } catch (error) {
      throw new UnauthorizedException();
    }
  }

  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.get<true | undefined>(
        AUTHZ_PUBLIC_KEY,
        context.getHandler()
      ) === true
    );
  }
}
