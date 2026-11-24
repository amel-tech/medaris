import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ExamResultsRepository } from "./exam-results.repository";
import { ExamResultsService } from "./exam-results.service";
import { OnlineExamRepository } from "./online-exam.repository";

/**
 * An online exam's results and its end for everyone (MDRS-299), with the two
 * repositories they read, which the rest of OnlineExamModule uses too. It has
 * no routes: OnlineExamModule serves them, and Değerlendirme's "Sonuçları
 * talebelere aç" (ExamModule) ends an online exam through
 * `ExamResultsService.closingForRelease`.
 *
 * A module of its own so that ExamModule can import it without importing
 * OnlineExamModule: the exported API document lists paths in the order the
 * modules are scanned, and OnlineExamModule's come last (app.module.ts).
 */
@Module({
  imports: [DatabaseModule],
  providers: [ExamResultsService, ExamResultsRepository, OnlineExamRepository],
  exports: [ExamResultsService, ExamResultsRepository, OnlineExamRepository],
})
export class OnlineExamResultsModule {}
