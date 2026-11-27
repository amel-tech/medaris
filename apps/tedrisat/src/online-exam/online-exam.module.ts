import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { CourseModule } from "../course/course.module";
import { DatabaseModule } from "../database/database.module";
import { PlatformAccessModule } from "../platform-access/platform-access.service";
import { QuestionNoteModule } from "../question-note/question-note.module";
import { ExamAttemptController } from "./exam-attempt.controller";
import { ExamAttemptRepository } from "./exam-attempt.repository";
import { ExamAttemptService } from "./exam-attempt.service";
import { ExamResultsController } from "./exam-results.controller";
import { MyExamsController } from "./my-exams.controller";
import { MyExamsRepository } from "./my-exams.repository";
import { MyExamsService } from "./my-exams.service";
import { OnlineExamController } from "./online-exam.controller";
import { OnlineExamService } from "./online-exam.service";
import { OnlineExamResultsModule } from "./online-exam-results.module";
import { ZerothAnswersController } from "./zeroth-answers.controller";
import { ZerothAnswersRepository } from "./zeroth-answers.repository";
import { ZerothAnswersService } from "./zeroth-answers.service";
import { ZerothQuestionController } from "./zeroth-question.controller";
import { ZerothQuestionRepository } from "./zeroth-question.repository";
import { ZerothQuestionService } from "./zeroth-question.service";

/**
 * Online multiple-choice exams (MDRS-299): topics, drafts and questions, each
 * medrese's zeroth question, a talebe's sitting of a published exam, the
 * team's results and early close, the talebe's own exams and results, and
 * management's aggregate of the zeroth answers.
 */
@Module({
  imports: [
    AuthGuardModule,
    CourseModule,
    DatabaseModule,
    PlatformAccessModule,
    // The results, the early close and the repositories they read.
    OnlineExamResultsModule,
    // The talebe's notes beside each question and the team's count of the
    // unanswered ones (MDRS-248, soru notları).
    QuestionNoteModule,
  ],
  controllers: [
    OnlineExamController,
    ZerothQuestionController,
    ExamAttemptController,
    ExamResultsController,
    MyExamsController,
    ZerothAnswersController,
  ],
  providers: [
    OnlineExamService,
    ZerothQuestionService,
    ZerothQuestionRepository,
    ExamAttemptService,
    ExamAttemptRepository,
    MyExamsService,
    MyExamsRepository,
    ZerothAnswersService,
    ZerothAnswersRepository,
  ],
})
export class OnlineExamModule {}
