import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { AssignmentModule } from "../assignment/assignment.module";
import { BanModule } from "../ban/ban.module";
import { DatabaseModule } from "../database/database.module";
import { InactiveScopeModule } from "../inactive-scope/inactive-scope.module";
import { NizamDashboardController } from "./nizam-dashboard.controller";
import { NizamDashboardRepository } from "./nizam-dashboard.repository";
import { NizamDashboardService } from "./nizam-dashboard.service";

/** The Medaris home page (MDRS-182, nizam/01 and 05). */
@Module({
  imports: [
    AuthGuardModule,
    DatabaseModule,
    AssignmentModule,
    InactiveScopeModule,
    BanModule,
  ],
  controllers: [NizamDashboardController],
  providers: [NizamDashboardService, NizamDashboardRepository],
})
export class NizamDashboardModule {}
