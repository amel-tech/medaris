import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { KoskModule } from "../kosk/kosk.module";
import { HostingController } from "./hosting.controller";
import { HostingRepository } from "./hosting.repository";
import { HostingService } from "./hosting.service";

/** Hosting rights: which medreses may open courses in a köşk (MDRS-170). */
@Module({
  imports: [AuthGuardModule, DatabaseModule, KoskModule],
  controllers: [HostingController],
  providers: [HostingService, HostingRepository],
})
export class HostingModule {}
