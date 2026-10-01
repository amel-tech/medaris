import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { MadrasahController } from "./madrasah.controller";
import { MadrasahRepository } from "./madrasah.repository";
import { MadrasahService } from "./madrasah.service";

@Module({
  imports: [AuthGuardModule, DatabaseModule],
  controllers: [MadrasahController],
  providers: [MadrasahService, MadrasahRepository],
  // For AuthzBindingsModule's role resolver: `isNazir`.
  exports: [MadrasahService],
})
export class MadrasahModule {}
