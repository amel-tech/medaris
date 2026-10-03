import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { KoskApplicationController } from "./kosk-application.controller";
import { KoskApplicationService } from "./kosk-application.service";

@Module({
  imports: [AuthGuardModule, DatabaseModule],
  controllers: [KoskApplicationController],
  providers: [KoskApplicationService],
})
export class KoskApplicationModule {}
