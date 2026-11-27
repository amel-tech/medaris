import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { CourseModule } from "../course/course.module";
import { DatabaseModule } from "../database/database.module";
import { OnlineExamResultsModule } from "../online-exam/online-exam-results.module";
import { PlatformAccessModule } from "../platform-access/platform-access.service";
import { QuestionNoteModule } from "../question-note/question-note.module";
import { PracticeController } from "./practice.controller";
import { PracticeRepository } from "./practice.repository";
import { PracticeService } from "./practice.service";

/**
 * Çalışma soruları (MDRS-248), the talebe's side: the published çalışma
 * setleri of their courses and their attempts at them. The team prepares a
 * set as an online exam of kind PRACTICE (OnlineExamModule); the questions
 * are read through OnlineExamResultsModule's `OnlineExamRepository`.
 */
@Module({
  imports: [
    AuthGuardModule,
    CourseModule,
    DatabaseModule,
    PlatformAccessModule,
    OnlineExamResultsModule,
    // The caller's note beside each question (soru notları).
    QuestionNoteModule,
  ],
  controllers: [PracticeController],
  providers: [PracticeService, PracticeRepository],
})
export class PracticeModule {}
