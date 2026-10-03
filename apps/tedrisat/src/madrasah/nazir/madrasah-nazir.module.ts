import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { AssignmentModule } from "../../assignment/assignment.module";
import { DatabaseModule } from "../../database/database.module";
import { MadrasahNazirController } from "./madrasah-nazir.controller";
import { MadrasahNazirRepository } from "./madrasah-nazir.repository";
import { MadrasahNazirService } from "./madrasah-nazir.service";

/** The medrese's nazırs (nazir/05, nazir/15), under `/madrasahs/:id/nazirs`. */
@Module({
  imports: [AuthGuardModule, DatabaseModule, AssignmentModule],
  controllers: [MadrasahNazirController],
  providers: [MadrasahNazirService, MadrasahNazirRepository],
})
export class MadrasahNazirModule {}
