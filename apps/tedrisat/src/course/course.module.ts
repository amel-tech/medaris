import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { KoskModule } from "../kosk/kosk.module";
import { CourseController } from "./course.controller";
import { CourseRepository } from "./course.repository";
import { CourseService } from "./course.service";

@Module({
  imports: [AuthGuardModule, KoskModule],
  controllers: [CourseController],
  providers: [CourseService, CourseRepository, DatabaseService],
  // For AuthzBindingsModule's role resolver (MDRS-41): enrollment and
  // muderris membership are read through this repository, not re-queried.
  exports: [CourseRepository],
})
export class CourseModule {}
