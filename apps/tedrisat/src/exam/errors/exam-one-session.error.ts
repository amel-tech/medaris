import { BadRequestError } from "@medaris/common";

/** An exam is planned as one celse, never as a weekly repeat (MDRS-248). */
export class ExamOneSessionError extends BadRequestError {
  static readonly code = "EXAM_ONE_SESSION";

  constructor(count: number) {
    super(
      ExamOneSessionError.code,
      `An exam is one session; the pattern gives ${count}`,
      { count }
    );
  }
}
