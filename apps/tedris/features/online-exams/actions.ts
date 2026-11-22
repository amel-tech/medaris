"use server";

import type {
  ExamAnswerSavedResponse,
  ExamAttemptResponse,
  ExamBriefingResponse,
  ExamClockResponse,
  ZerothAnswerResponse,
} from "@medaris/services/tedrisat";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/**
 * A talebe's sitting of an online exam (MDRS-299), by its celse. The API
 * answers a caller's own attempt to the caller alone. Nothing is revalidated:
 * the exam page keeps its own state, and no server-rendered page shows it.
 */

type Result<T> = Promise<AuthenticatedActionResult<T>>;

export const readExamBriefing = async (
  lessonId: string
): Result<ExamBriefingResponse> =>
  authenticatedAction((api) =>
    api.onlineExamAttempts.getExamBriefing({ id: lessonId })
  );

export const answerZerothQuestion = async (
  lessonId: string,
  optionId: string
): Result<ZerothAnswerResponse> =>
  authenticatedAction((api) =>
    api.onlineExamAttempts.answerZerothQuestion({
      id: lessonId,
      zerothAnswerDto: { optionId },
    })
  );

export const startExamAttempt = async (
  lessonId: string,
  holderId: string
): Result<ExamAttemptResponse> =>
  authenticatedAction((api) =>
    api.onlineExamAttempts.startExamAttempt({
      id: lessonId,
      examHolderDto: { holderId },
    })
  );

export const resumeExamAttempt = async (
  lessonId: string,
  holderId: string
): Result<ExamAttemptResponse> =>
  authenticatedAction((api) =>
    api.onlineExamAttempts.resumeExamAttempt({
      id: lessonId,
      examHolderDto: { holderId },
    })
  );

export const saveExamAnswer = async (
  lessonId: string,
  questionId: string,
  answer: {
    holderId: string;
    seq: number;
    optionIds: string[];
    skipped: boolean;
    currentQuestionId?: string;
  }
): Result<ExamAnswerSavedResponse> =>
  authenticatedAction((api) =>
    api.onlineExamAttempts.saveExamAnswer({
      id: lessonId,
      questionId,
      saveExamAnswerDto: answer,
    })
  );

export const tickExamClock = async (
  lessonId: string,
  holderId: string
): Result<ExamClockResponse> =>
  authenticatedAction((api) =>
    api.onlineExamAttempts.tickExamClock({
      id: lessonId,
      examHolderDto: { holderId },
    })
  );

export const recordTabSwitch = async (
  lessonId: string,
  holderId: string
): Result<ExamAttemptResponse> =>
  authenticatedAction((api) =>
    api.onlineExamAttempts.recordTabSwitch({
      id: lessonId,
      examHolderDto: { holderId },
    })
  );

export const finishExamAttempt = async (
  lessonId: string,
  holderId: string
): Result<ExamAttemptResponse> =>
  authenticatedAction((api) =>
    api.onlineExamAttempts.finishExamAttempt({
      id: lessonId,
      examHolderDto: { holderId },
    })
  );
