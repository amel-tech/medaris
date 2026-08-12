// auth/auth.guard.ts
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JWT_VERIFIER } from "./auth-guard.tokens";
import type { IJwtVerifier } from "./interfaces/jwt-verifier.interface";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(JWT_VERIFIER) private readonly jwtVerifier: IJwtVerifier
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const authHeader = request.headers["authorization"];
    if (!authHeader) {
      throw new UnauthorizedException();
    }

    const [bearer, token] = authHeader.split(" ");
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
}
