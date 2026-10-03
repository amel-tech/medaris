import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { KeycloakAdminModule } from "../keycloak-admin/keycloak-admin.module";
import { KoskController } from "./kosk.controller";
import { KoskRepository } from "./kosk.repository";
import { KoskService } from "./kosk.service";
import { KoskAdminController } from "./kosk-admin.controller";
import { KoskAdminRepository } from "./kosk-admin.repository";
import { KoskAdminService } from "./kosk-admin.service";

@Module({
  imports: [AuthGuardModule, KeycloakAdminModule],
  // `KoskAdminController` first: `GET /kosks/directory` must be matched before
  // `GET /kosks/:id` reads "directory" as an id.
  controllers: [KoskAdminController, KoskController],
  providers: [
    KoskService,
    KoskRepository,
    KoskAdminService,
    KoskAdminRepository,
    DatabaseService,
  ],
  exports: [KoskService],
})
export class KoskModule {}
