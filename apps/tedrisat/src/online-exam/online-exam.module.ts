import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { CourseModule } from "../course/course.module";
import { DatabaseModule } from "../database/database.module";
import { ExamAttemptController } from "./exam-attempt.controller";
import { ExamAttemptRepository } from "./exam-attempt.repository";
import { ExamAttemptService } from "./exam-attempt.service";
import { ExamResultsController } from "./exam-results.controller";
import { ExamResultsRepository } from "./exam-results.repository";
import { ExamResultsService } from "./exam-results.service";
import { MyExamsController } from "./my-exams.controller";
import { MyExamsRepository } from "./my-exams.repository";
import { MyExamsService } from "./my-exams.service";
import { OnlineExamController } from "./online-exam.controller";
import { OnlineExamRepository } from "./online-exam.repository";
import { OnlineExamService } from "./online-exam.service";
import { ZerothQuestionController } from "./zeroth-question.controller";
import { ZerothQuestionRepository } from "./zeroth-question.repository";
import { ZerothQuestionService } from "./zeroth-question.service";

/**
 * Online multiple-choice exams (MDRS-299): topics, drafts and questions, each
 * medrese's zeroth question, a talebe's sitting of a published exam, the
 * team's results and early close, and the talebe's own exams and results.
 */
@Module({
  imports: [AuthGuardModule, CourseModule, DatabaseModule],
  controllers: [
    OnlineExamController,
    ZerothQuestionController,
    ExamAttemptController,
    ExamResultsController,
    MyExamsController,
  ],
  providers: [
    OnlineExamService,
    OnlineExamRepository,
    ZerothQuestionService,
    ZerothQuestionRepository,
    ExamAttemptService,
    ExamAttemptRepository,
    ExamResultsService,
    ExamResultsRepository,
    MyExamsService,
    MyExamsRepository,
  ],
})
export class OnlineExamModule {}
