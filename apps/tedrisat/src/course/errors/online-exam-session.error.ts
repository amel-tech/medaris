import { ConflictError } from "@medaris/common";

/**
 * The celse an online exam was published with (MDRS-299): its time, its
 * length, cancelling and hiding it are the exam page's, which takes the
 * exam back to a draft. Anything else of the celse may change here.
 */
export class OnlineExamSessionError extends ConflictError {
  static readonly code = "ONLINE_EXAM_SESSION";
  constructor(lessonId: string, examId: string) {
    super(
      OnlineExamSessionError.code,
      `Session ${lessonId} is online exam ${examId}; change it on the exam's page`,
      { lessonId, examId }
    );
  }
}
