import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ScheduleController } from "./schedule.controller";
import { ScheduleRepository } from "./schedule.repository";
import { ScheduleService } from "./schedule.service";

/** The caller's own schedule: Programım and the phone menu's next session (MDRS-163). */
@Module({
  imports: [AuthGuardModule, DatabaseModule],
  controllers: [ScheduleController],
  providers: [ScheduleService, ScheduleRepository],
})
export class ScheduleModule {}
