import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { KeycloakAdminModule } from "../keycloak-admin/keycloak-admin.module";
import { PassivationModule } from "../passivation/passivation.module";
import { MadrasahController } from "./madrasah.controller";
import { MadrasahRepository } from "./madrasah.repository";
import { MadrasahService } from "./madrasah.service";

@Module({
  imports: [
    AuthGuardModule,
    DatabaseModule,
    KeycloakAdminModule,
    PassivationModule,
  ],
  controllers: [MadrasahController],
  providers: [MadrasahService, MadrasahRepository],
  // For AuthzBindingsModule's role resolver: `isNazir`.
  exports: [MadrasahService],
})
export class MadrasahModule {}
