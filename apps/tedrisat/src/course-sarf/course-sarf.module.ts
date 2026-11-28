import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { CourseModule } from "../course/course.module";
import { DatabaseService } from "../database/database.service";
import { CourseSarfController } from "./course-sarf.controller";
import { CourseSarfRepository } from "./course-sarf.repository";

@Module({
  imports: [AuthGuardModule, CourseModule],
  controllers: [CourseSarfController],
  providers: [CourseSarfRepository, DatabaseService],
})
export class CourseSarfModule {}
