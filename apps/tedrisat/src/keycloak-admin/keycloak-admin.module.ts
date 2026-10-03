import { Module } from "@nestjs/common";
import {
  KEYCLOAK_ADMIN_FETCH,
  KeycloakAdminService,
} from "./keycloak-admin.service";

@Module({
  providers: [
    {
      provide: KEYCLOAK_ADMIN_FETCH,
      useValue: (...args: Parameters<typeof fetch>) => fetch(...args),
    },
    KeycloakAdminService,
  ],
  exports: [KeycloakAdminService],
})
export class KeycloakAdminModule {}
