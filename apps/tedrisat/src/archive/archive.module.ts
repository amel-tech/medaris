import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { KoskModule } from "../kosk/kosk.module";
import { ArchiveController } from "./archive.controller";
import { ArchiveRepository } from "./archive.repository";
import { ArchiveService } from "./archive.service";

/** The archive of hidden things (MDRS-173). */
@Module({
  imports: [AuthGuardModule, DatabaseModule, KoskModule],
  controllers: [ArchiveController],
  providers: [ArchiveService, ArchiveRepository],
})
export class ArchiveModule {}
