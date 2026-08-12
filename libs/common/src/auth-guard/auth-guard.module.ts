import { CacheModule } from "@nestjs/cache-manager";
import { Module } from "@nestjs/common";
import { AuthGuard } from "./auth-guard";
import { ICACHE, JWT_VERIFIER, PUBLIC_KEY_PROVIDER } from "./auth-guard.tokens";
import { MemoryCache } from "./cache/memory-cache";
import { KeycloakPublicKeyProvider } from "./key-providers/keycloak-public-key-provider";
import { JwtVerifierService } from "./services/jwt-verifier.service";

@Module({
  imports: [CacheModule.register()],
  providers: [
    {
      provide: ICACHE,
      useClass: MemoryCache,
    },
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
  exports: [AuthGuard, PUBLIC_KEY_PROVIDER, JWT_VERIFIER, ICACHE],
})
export class AuthGuardModule {}
