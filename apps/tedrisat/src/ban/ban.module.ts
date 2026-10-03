import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { KoskModule } from "../kosk/kosk.module";
import { MadrasahModule } from "../madrasah/madrasah.module";
import { NotificationModule } from "../notification/notification.module";
import { BanController } from "./ban.controller";
import { BanRepository } from "./ban.repository";
import { BanService } from "./ban.service";
import { MadrasahBanController } from "./madrasah-ban.controller";

/**
 * Bans: barring a talebe from a course, a köşk or a medrese, and lifting it
 * (MDRS-177, MDRS-187).
 */
@Module({
  imports: [
    AuthGuardModule,
    DatabaseModule,
    KoskModule,
    MadrasahModule,
    NotificationModule,
  ],
  controllers: [BanController, MadrasahBanController],
  providers: [BanService, BanRepository],
  exports: [BanService, BanRepository],
})
export class BanModule {}
