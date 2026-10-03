import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { BanModule } from "../ban/ban.module";
import { CourseModule } from "../course/course.module";
import { DatabaseService } from "../database/database.service";
import { LessonNoteController } from "./lesson-note.controller";
import { LessonNoteRepository } from "./lesson-note.repository";
import { LessonNoteService } from "./lesson-note.service";

/** A talebe's private notes on a session's video (MDRS-150). */
@Module({
  imports: [AuthGuardModule, CourseModule, BanModule],
  controllers: [LessonNoteController],
  providers: [LessonNoteService, LessonNoteRepository, DatabaseService],
})
export class LessonNoteModule {}
