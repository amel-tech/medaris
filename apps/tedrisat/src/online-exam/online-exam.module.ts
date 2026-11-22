import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { CourseModule } from "../course/course.module";
import { DatabaseModule } from "../database/database.module";
import { ExamAttemptController } from "./exam-attempt.controller";
import { ExamAttemptRepository } from "./exam-attempt.repository";
import { ExamAttemptService } from "./exam-attempt.service";
import { OnlineExamController } from "./online-exam.controller";
import { OnlineExamRepository } from "./online-exam.repository";
import { OnlineExamService } from "./online-exam.service";
import { ZerothQuestionController } from "./zeroth-question.controller";
import { ZerothQuestionRepository } from "./zeroth-question.repository";
import { ZerothQuestionService } from "./zeroth-question.service";

/**
 * Online multiple-choice exams (MDRS-299): topics, drafts and questions, each
 * medrese's zeroth question, and a talebe's sitting of a published exam.
 */
@Module({
  imports: [AuthGuardModule, CourseModule, DatabaseModule],
  controllers: [
    OnlineExamController,
    ZerothQuestionController,
    ExamAttemptController,
  ],
  providers: [
    OnlineExamService,
    OnlineExamRepository,
    ZerothQuestionService,
    ZerothQuestionRepository,
    ExamAttemptService,
    ExamAttemptRepository,
  ],
})
export class OnlineExamModule {}
