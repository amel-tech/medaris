import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { CourseModule } from "../course/course.module";
import { DatabaseService } from "../database/database.service";
import { CourseTermController } from "./course-term.controller";
import { CourseTermRepository } from "./course-term.repository";

@Module({
  imports: [AuthGuardModule, CourseModule],
  controllers: [CourseTermController],
  providers: [CourseTermRepository, DatabaseService],
})
export class CourseTermModule {}
