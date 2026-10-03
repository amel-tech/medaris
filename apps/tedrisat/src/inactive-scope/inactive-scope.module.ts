import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { KeycloakAdminModule } from "../keycloak-admin/keycloak-admin.module";
import { MadrasahModule } from "../madrasah/madrasah.module";
import { InactiveScopeController } from "./inactive-scope.controller";
import { InactiveScopeRepository } from "./inactive-scope.repository";
import { InactiveScopeService } from "./inactive-scope.service";

@Module({
  imports: [
    AuthGuardModule,
    DatabaseModule,
    KeycloakAdminModule,
    MadrasahModule,
  ],
  controllers: [InactiveScopeController],
  providers: [InactiveScopeService, InactiveScopeRepository],
  exports: [InactiveScopeService],
})
export class InactiveScopeModule {}
