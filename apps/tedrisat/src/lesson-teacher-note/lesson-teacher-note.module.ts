import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { CourseModule } from "../course/course.module";
import { DatabaseService } from "../database/database.service";
import { LessonTeacherNoteController } from "./lesson-teacher-note.controller";
import { LessonTeacherNoteRepository } from "./lesson-teacher-note.repository";

@Module({
  imports: [AuthGuardModule, CourseModule],
  controllers: [LessonTeacherNoteController],
  providers: [LessonTeacherNoteRepository, DatabaseService],
})
export class LessonTeacherNoteModule {}
