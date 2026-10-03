import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { MadrasahCourseModule } from "../course/madrasah-course.module";
import { MadrasahModule } from "../madrasah.module";
import { MadrasahPortalController } from "./madrasah-portal.controller";
import { MadrasahPortalRepository } from "./madrasah-portal.repository";
import { MadrasahPortalService } from "./madrasah-portal.service";

/**
 * The nazır portal's talebe list (nazir/10) and Pano (nazir/01), under
 * `/madrasahs/:id/students` and `/madrasahs/:id/dashboard`.
 */
@Module({
  imports: [
    AuthGuardModule,
    DatabaseModule,
    MadrasahModule,
    MadrasahCourseModule,
  ],
  controllers: [MadrasahPortalController],
  providers: [MadrasahPortalService, MadrasahPortalRepository],
})
export class MadrasahPortalModule {}
