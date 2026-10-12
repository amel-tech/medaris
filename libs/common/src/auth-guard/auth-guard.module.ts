import { Module } from "@nestjs/common";
import { AuthGuard } from "./auth-guard";
import { JWT_VERIFIER, PUBLIC_KEY_PROVIDER } from "./auth-guard.tokens";
import { KeycloakPublicKeyProvider } from "./key-providers/keycloak-public-key-provider";
import { JwtVerifierService } from "./services/jwt-verifier.service";

@Module({
  providers: [
    {
      provide: PUBLIC_KEY_PROVIDER,
      useClass: KeycloakPublicKeyProvider,
    },
    {
      provide: JWT_VERIFIER,
      useClass: JwtVerifierService,
    },
    AuthGuard,
  ],
  exports: [AuthGuard, PUBLIC_KEY_PROVIDER, JWT_VERIFIER],
})
export class AuthGuardModule {}
