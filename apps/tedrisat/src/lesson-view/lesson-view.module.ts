import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { CourseModule } from "../course/course.module";
import { DatabaseService } from "../database/database.service";
import { LessonViewController } from "./lesson-view.controller";
import { LessonViewRepository } from "./lesson-view.repository";
import { LessonViewService } from "./lesson-view.service";

/** How far a talebe has watched each celse, and their course progress from it (MDRS-248). */
@Module({
  imports: [AuthGuardModule, CourseModule],
  controllers: [LessonViewController],
  providers: [LessonViewService, LessonViewRepository, DatabaseService],
})
export class LessonViewModule {}
