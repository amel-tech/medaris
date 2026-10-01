import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { KoskModule } from "../kosk/kosk.module";
import { MadrasahController } from "./madrasah.controller";
import { MadrasahRepository } from "./madrasah.repository";
import { MadrasahService } from "./madrasah.service";

@Module({
  imports: [AuthGuardModule, DatabaseModule, KoskModule],
  controllers: [MadrasahController],
  providers: [MadrasahService, MadrasahRepository],
  // For AuthzBindingsModule's role resolver: `isNazir`, `isNazirOfKosk`.
  exports: [MadrasahService],
})
export class MadrasahModule {}
