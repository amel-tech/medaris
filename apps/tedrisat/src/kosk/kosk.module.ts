import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { KoskController } from "./kosk.controller";
import { KoskRepository } from "./kosk.repository";
import { KoskService } from "./kosk.service";

@Module({
  imports: [AuthGuardModule],
  controllers: [KoskController],
  providers: [KoskService, KoskRepository, DatabaseService],
  exports: [KoskService],
})
export class KoskModule {}
