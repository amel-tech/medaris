import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { CourseModule } from "../course/course.module";
import { DatabaseModule } from "../database/database.module";
import { PlatformAccessModule } from "../platform-access/platform-access.service";
import { QuestionNoteController } from "./question-note.controller";
import { QuestionNoteRepository } from "./question-note.repository";
import { QuestionNoteService } from "./question-note.service";

/**
 * Soru notları (MDRS-248): a talebe's notes on the questions of çalışma
 * setleri and online exams, and the hoca's answers. The repository is
 * exported so the attempt and result pages can put the caller's note beside
 * each question, and the team's lists count the unanswered ones.
 */
@Module({
  imports: [
    AuthGuardModule,
    CourseModule,
    DatabaseModule,
    PlatformAccessModule,
  ],
  controllers: [QuestionNoteController],
  providers: [QuestionNoteService, QuestionNoteRepository],
  exports: [QuestionNoteRepository],
})
export class QuestionNoteModule {}
