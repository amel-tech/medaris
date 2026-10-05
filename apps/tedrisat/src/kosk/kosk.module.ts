import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { DatabaseService } from "../database/database.service";
import { KeycloakAdminModule } from "../keycloak-admin/keycloak-admin.module";
import { LessonInvitationModule } from "../lesson-invitation/lesson-invitation.module";
import { PassivationModule } from "../passivation/passivation.module";
import { PlatformPolicyModule } from "../platform-policy/platform-policy.module";
import { KoskController } from "./kosk.controller";
import { KoskRepository } from "./kosk.repository";
import { KoskService } from "./kosk.service";
import { KoskAdminController } from "./kosk-admin.controller";
import { KoskAdminRepository } from "./kosk-admin.repository";
import { KoskAdminService } from "./kosk-admin.service";
import { KoskDashboardRepository } from "./kosk-dashboard.repository";
import { KoskDashboardService } from "./kosk-dashboard.service";
import { KoskGrantsController } from "./kosk-grants.controller";
import { KoskGrantsRepository } from "./kosk-grants.repository";
import { KoskGrantsService } from "./kosk-grants.service";

@Module({
  imports: [
    AuthGuardModule,
    KeycloakAdminModule,
    AuditModule,
    PlatformPolicyModule,
    LessonInvitationModule,
    PassivationModule,
  ],
  // `KoskAdminController` first: `GET /kosks/directory` must be matched before
  // `GET /kosks/:id` reads "directory" as an id.
  controllers: [KoskAdminController, KoskGrantsController, KoskController],
  providers: [
    KoskService,
    KoskRepository,
    KoskAdminService,
    KoskAdminRepository,
    KoskDashboardService,
    KoskDashboardRepository,
    KoskGrantsService,
    KoskGrantsRepository,
    DatabaseService,
  ],
  exports: [KoskService],
})
export class KoskModule {}
