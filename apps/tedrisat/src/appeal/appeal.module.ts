import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { MadrasahModule } from "../madrasah/madrasah.module";
import { PlatformAccessModule } from "../platform-access/platform-access.service";
import {
  AppealController,
  MadrasahAppealController,
} from "./appeal.controller";
import { AppealRepository } from "./appeal.repository";
import { AppealService } from "./appeal.service";

/** İtirazlar: a medrese's appeal against a köşk refusing its course request. */
@Module({
  imports: [
    AuthGuardModule,
    DatabaseModule,
    MadrasahModule,
    PlatformAccessModule,
  ],
  controllers: [MadrasahAppealController, AppealController],
  providers: [AppealService, AppealRepository],
})
export class AppealModule {}
