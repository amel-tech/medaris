import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { AssignmentModule } from "../../assignment/assignment.module";
import { DatabaseModule } from "../../database/database.module";
import { MadrasahModule } from "../madrasah.module";
import { MadrasahCourseController } from "./madrasah-course.controller";
import { MadrasahCourseRepository } from "./madrasah-course.repository";
import { MadrasahCourseService } from "./madrasah-course.service";

/**
 * The medrese's own courses (nazir/07, 08, 17, 18), under
 * `/madrasahs/:id/hosting-kosks` and `/madrasahs/:id/courses`.
 */
@Module({
  imports: [AuthGuardModule, DatabaseModule, AssignmentModule, MadrasahModule],
  controllers: [MadrasahCourseController],
  providers: [MadrasahCourseService, MadrasahCourseRepository],
  // For the Pano's köşk list (`MadrasahPortalService`).
  exports: [MadrasahCourseService],
})
export class MadrasahCourseModule {}
