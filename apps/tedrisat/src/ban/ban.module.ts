import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { KoskModule } from "../kosk/kosk.module";
import { NotificationModule } from "../notification/notification.module";
import { BanController } from "./ban.controller";
import { BanRepository } from "./ban.repository";
import { BanService } from "./ban.service";

/** Bans: barring a talebe from a course or a köşk, and lifting it (MDRS-177). */
@Module({
  imports: [AuthGuardModule, DatabaseModule, KoskModule, NotificationModule],
  controllers: [BanController],
  providers: [BanService, BanRepository],
  exports: [BanService, BanRepository],
})
export class BanModule {}
