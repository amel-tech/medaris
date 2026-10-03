import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { KeycloakAdminModule } from "../keycloak-admin/keycloak-admin.module";
import { AssignmentRepository } from "./assignment.repository";
import { AssignmentService } from "./assignment.service";
import { MeAssignmentsController } from "./me-assignments.controller";
import { NizamController } from "./nizam.controller";
import { UserDirectoryService } from "./user-directory.service";

@Module({
  imports: [AuthGuardModule, DatabaseModule, KeycloakAdminModule],
  controllers: [MeAssignmentsController, NizamController],
  providers: [AssignmentRepository, AssignmentService, UserDirectoryService],
  exports: [UserDirectoryService],
})
export class AssignmentModule {}
