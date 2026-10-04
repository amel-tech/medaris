import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { TedrisatAuthzContext } from "../authz/tedrisat-authz-context.service";
import { DatabaseModule } from "../database/database.module";
import { KeycloakAdminModule } from "../keycloak-admin/keycloak-admin.module";
import { PermissionAdminController } from "./admin/permission-admin.controller";
import { PermissionAdminRepository } from "./admin/permission-admin.repository";
import { PermissionAdminService } from "./admin/permission-admin.service";
import { AssignmentRepository } from "./assignment.repository";
import { AssignmentService } from "./assignment.service";
import { MeAssignmentsController } from "./me-assignments.controller";
import { NizamController } from "./nizam.controller";
import { UserDirectoryService } from "./user-directory.service";

@Module({
  imports: [AuthGuardModule, DatabaseModule, KeycloakAdminModule],
  controllers: [
    MeAssignmentsController,
    NizamController,
    PermissionAdminController,
  ],
  providers: [
    TedrisatAuthzContext,
    AssignmentRepository,
    AssignmentService,
    UserDirectoryService,
    PermissionAdminRepository,
    PermissionAdminService,
  ],
  exports: [
    AssignmentRepository,
    UserDirectoryService,
    PermissionAdminRepository,
    AssignmentService,
  ],
})
export class AssignmentModule {}
