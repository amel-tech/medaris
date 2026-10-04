import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { CourseModule } from "../course/course.module";
import { DatabaseService } from "../database/database.service";
import { LessonQuestionController } from "./lesson-question.controller";
import { LessonQuestionRepository } from "./lesson-question.repository";
import { LessonQuestionService } from "./lesson-question.service";

/** A talebe's questions to the course staff, and their answers (MDRS-150). */
@Module({
  imports: [AuthGuardModule, CourseModule],
  controllers: [LessonQuestionController],
  providers: [LessonQuestionService, LessonQuestionRepository, DatabaseService],
})
export class LessonQuestionModule {}
