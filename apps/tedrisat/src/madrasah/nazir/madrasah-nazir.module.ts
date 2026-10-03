import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { AssignmentModule } from "../../assignment/assignment.module";
import { DatabaseModule } from "../../database/database.module";
import { MadrasahModule } from "../madrasah.module";
import { MadrasahNazirController } from "./madrasah-nazir.controller";
import { MadrasahNazirRepository } from "./madrasah-nazir.repository";
import { MadrasahNazirService } from "./madrasah-nazir.service";
import { MadrasahPermissionController } from "./madrasah-permission.controller";
import { MadrasahPermissionService } from "./madrasah-permission.service";

/**
 * The medrese's nazırs and what they are given (nazir/05, 06, 15, 16), under
 * `/madrasahs/:id/nazirs`, `/permission-groups` and `/permissions`.
 */
@Module({
  imports: [AuthGuardModule, DatabaseModule, AssignmentModule, MadrasahModule],
  controllers: [MadrasahNazirController, MadrasahPermissionController],
  providers: [
    MadrasahNazirService,
    MadrasahNazirRepository,
    MadrasahPermissionService,
  ],
})
export class MadrasahNazirModule {}
