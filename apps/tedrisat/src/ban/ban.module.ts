import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { TedrisatAuthzContext } from "../authz/tedrisat-authz-context.service";
import { DatabaseModule } from "../database/database.module";
import { KoskModule } from "../kosk/kosk.module";
import { MadrasahModule } from "../madrasah/madrasah.module";
import { NotificationModule } from "../notification/notification.module";
import { BanController } from "./ban.controller";
import { BanRepository } from "./ban.repository";
import { BanService } from "./ban.service";
import { BanAuthority } from "./ban-authority";
import { MadrasahBanController } from "./madrasah-ban.controller";
import { PermanentBanController } from "./permanent-ban.controller";
import { PermanentBanRepository } from "./permanent-ban.repository";
import { PermanentBanService } from "./permanent-ban.service";

/**
 * Bans: barring a talebe from a course, a köşk, a medrese or the platform, and
 * lifting it (MDRS-177, MDRS-187), decided from the permission catalogue
 * (MDRS-205); and Medaris administration's decisions on the requests for a
 * permanent ban (MDRS-194).
 */
@Module({
  imports: [
    AuthGuardModule,
    DatabaseModule,
    KoskModule,
    MadrasahModule,
    NotificationModule,
  ],
  controllers: [BanController, MadrasahBanController, PermanentBanController],
  // The context loader is read straight from the database, as `PlatformAccessModule`
  // does: `BanAuthority` asks the engine's own computation what the caller holds.
  providers: [
    BanService,
    BanRepository,
    BanAuthority,
    TedrisatAuthzContext,
    PermanentBanService,
    PermanentBanRepository,
  ],
  exports: [BanService, BanRepository, PermanentBanService],
})
export class BanModule {}
