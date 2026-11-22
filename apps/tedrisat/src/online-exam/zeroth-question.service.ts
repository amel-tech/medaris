import { Injectable } from "@nestjs/common";
import type { MadrasahZerothQuestionResponse } from "./dto/zeroth-question.dto";
import {
  type IMadrasahZerothQuestion,
  type IZerothQuestion,
  ZerothQuestionRepository,
} from "./zeroth-question.repository";

const answer = (
  question: IMadrasahZerothQuestion | null
): MadrasahZerothQuestionResponse => ({
  text: question?.text ?? "",
  options: question?.options ?? [],
  updatedAt: question?.updatedAt.toISOString() ?? null,
});

/**
 * A medrese's zeroth question (MDRS-299). The owner, 22 Nov 2026, relaying
 * the medrese: the same question for every exam of a term ("vize"), changed
 * for the next ("final"). A change reaches only the exams published after
 * it: publishing copies the question into the exam. The routes' resolver
 * answers an unknown medrese as not found before this runs.
 */
@Injectable()
export class ZerothQuestionService {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly repo: ZerothQuestionRepository) {}

  async get(madrasahId: string): Promise<MadrasahZerothQuestionResponse> {
    return answer(await this.repo.findForMadrasah(madrasahId));
  }

  async save(
    madrasahId: string,
    input: IZerothQuestion,
    actorId: string
  ): Promise<MadrasahZerothQuestionResponse> {
    return answer(await this.repo.replace(madrasahId, input, actorId));
  }
}
