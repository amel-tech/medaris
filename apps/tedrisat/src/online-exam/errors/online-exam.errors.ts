import { BadRequestError, ConflictError, NotFoundError } from "@medaris/common";
import type { PublishProblem, PublishTimeProblem } from "../domain/online-exam";

/**
 * The refusals of an online exam's preparation (MDRS-299), with the codes
 * `graphs/domain/planned-exams.yaml` proposes. A celse that is not an online
 * exam is the existing EXAM_NOT_FOUND (`exam/errors`).
 */

/** Someone else saved the exam since the page read it: nothing is written, and the page reads it again. */
export class ExamStaleError extends ConflictError {
  static readonly code = "EXAM_STALE";
  constructor(examId: string, version: number) {
    super(
      ExamStaleError.code,
      `Exam ${examId} changed since version ${version} was read`,
      { examId, version }
    );
  }
}

/**
 * The exam is published: nothing of it changes. Until it opens it can be
 * taken back to a draft; once it has opened, not even that.
 */
export class ExamLockedError extends ConflictError {
  static readonly code = "EXAM_LOCKED";
  constructor(examId: string) {
    super(ExamLockedError.code, `Exam ${examId} is published`, { examId });
  }
}

/** A topic is one to three words. */
export class TopicTooLongError extends BadRequestError {
  static readonly code = "TOPIC_TOO_LONG";
  constructor(words: number) {
    super(
      TopicTooLongError.code,
      `A topic is one to three words, not ${words}`,
      {
        words,
      }
    );
  }
}

/** The course has a topic of that name, whatever its case. */
export class TopicExistsError extends ConflictError {
  static readonly code = "TOPIC_EXISTS";
  constructor(name: string) {
    super(TopicExistsError.code, `The course has a topic named ${name}`, {
      name,
    });
  }
}

/** Another topic of the course has that number. */
export class TopicNumberTakenError extends ConflictError {
  static readonly code = "TOPIC_NUMBER_TAKEN";
  constructor(number: number) {
    super(
      TopicNumberTakenError.code,
      `Another topic of the course has number ${number}`,
      { number }
    );
  }
}

/** No such topic in the course (a rename of one that is not there). */
export class TopicNotFoundError extends NotFoundError {
  static readonly code = "TOPIC_NOT_FOUND";
  constructor(topicId: string) {
    super(TopicNotFoundError.code, `No topic ${topicId} in the course`, {
      topicId,
    });
  }
}

/**
 * A topic that questions carry is not deleted: they would lose it. The
 * refusal names them, each by its exam and its number there.
 */
export class TopicInUseError extends ConflictError {
  static readonly code = "TOPIC_IN_USE";
  constructor(
    topicId: string,
    questions: Array<{ examId: string; examTitle: string; number: number }>
  ) {
    super(
      TopicInUseError.code,
      `${questions.length} questions carry topic ${topicId}`,
      { topicId, questions }
    );
  }
}

/** A topic named in a write that is not the course's. */
export class TopicNotOfCourseError extends BadRequestError {
  static readonly code = "TOPIC_NOT_FOUND";
  constructor(topicIds: string[]) {
    super(
      TopicNotOfCourseError.code,
      `Topics not of the course: ${topicIds.join(", ")}`,
      { topicIds }
    );
  }
}

/** A question of another exam, or one removed meanwhile. */
export class QuestionNotFoundError extends NotFoundError {
  static readonly code = "QUESTION_NOT_FOUND";
  constructor(questionId: string) {
    super(QuestionNotFoundError.code, `No question ${questionId} in the exam`, {
      questionId,
    });
  }
}

/** Check boxes with fewer than two correct options, or a scoring without check boxes. */
export class QuestionModeInvalidError extends BadRequestError {
  static readonly code = "QUESTION_MODE_INVALID";
  constructor(correct: number) {
    super(
      QuestionModeInvalidError.code,
      `Check boxes need two correct options or more and a scoring; radio buttons take none (${correct} correct)`,
      { correct }
    );
  }
}

/** The points would pass 100, or leave nothing for the questions that share. */
export class PointsOverTotalError extends ConflictError {
  static readonly code = "POINTS_OVER_TOTAL";
  constructor(pointsLeft: string) {
    super(
      PointsOverTotalError.code,
      `Only ${pointsLeft} points are left to give`,
      { pointsLeft }
    );
  }
}

/** No such online exam in the course. */
export class OnlineExamNotFoundError extends NotFoundError {
  static readonly code = "EXAM_NOT_FOUND";
  constructor(examId: string) {
    super(OnlineExamNotFoundError.code, `No online exam ${examId}`, {
      examId,
    });
  }
}

/** The exam is not complete yet: every problem is listed, and nothing is published. */
export class ExamNotReadyError extends ConflictError {
  static readonly code = "EXAM_NOT_READY";
  constructor(examId: string, problems: PublishProblem[]) {
    super(ExamNotReadyError.code, `Exam ${examId} is not ready to publish`, {
      examId,
      problems,
    });
  }
}

/** The start chosen has passed, or the latest start is before it. */
export class ExamTimePassedError extends BadRequestError {
  static readonly code = "EXAM_TIME_PASSED";
  constructor(reason: PublishTimeProblem) {
    super(ExamTimePassedError.code, `Cannot publish: ${reason}`, { reason });
  }
}

/** Taking back an exam that is a draft already. */
export class ExamNotPublishedError extends ConflictError {
  static readonly code = "EXAM_NOT_PUBLISHED";
  constructor(examId: string) {
    super(ExamNotPublishedError.code, `Exam ${examId} is not published`, {
      examId,
    });
  }
}
