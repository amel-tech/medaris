import { and, eq, inArray, isNotNull, type SQLWrapper, sql } from "drizzle-orm";
import type { DatabaseService } from "../database/database.service";
import { deleteAssignmentsIn } from "../database/role-assignments";
import { auditLog } from "../database/schema/audit.schema";
import {
  courseMuderris,
  courseResources,
  courses,
  courseWeeks,
  enrollments,
  lessonRecordings,
  lessonResources,
  lessons,
} from "../database/schema/course.schema";
import {
  examAnswers,
  examAttempts,
  examTabSwitches,
  zerothAnswers,
} from "../database/schema/exam-attempt.schema";
import {
  assignmentEvaluations,
  lessonAssignmentFiles,
  lessonAssignments,
} from "../database/schema/lesson-assignment.schema";
import {
  examResults,
  lessonExams,
} from "../database/schema/lesson-exam.schema";
import { lessonNotes } from "../database/schema/lesson-note.schema";
import { lessonQuestions } from "../database/schema/lesson-question.schema";
import {
  lessonSubmissions,
  submissionFiles,
  submissionReviewFiles,
} from "../database/schema/lesson-submission.schema";
import { lessonViews } from "../database/schema/lesson-view.schema";
import {
  courseExamTopics,
  courseZerothOptions,
  courseZerothQuestions,
  examOptions,
  examQuestions,
  examQuestionTopics,
  onlineExams,
  onlineExamTopics,
  zerothOptions,
} from "../database/schema/online-exam.schema";
import {
  partnerCourseCodes,
  partnerEnrollmentLinks,
} from "../database/schema/partner-enrollment.schema";
import {
  practiceAnswers,
  practiceAttempts,
} from "../database/schema/practice.schema";
import { questionNotes } from "../database/schema/question-note.schema";
import { SCOPE_TYPES } from "../database/schema/role-assignment.schema";
import {
  type DeletionReason,
  enqueueStorageDeletions,
} from "../storage/storage-deletions";

export type Tx = Parameters<
  Parameters<DatabaseService["db"]["transaction"]>[0]
>[0];

/** How many rows of each table a real delete removed (MDRS-124). */
export interface IPurgeCounts {
  courses: number;
  weeks: number;
  lessons: number;
  muderris: number;
  resources: number;
  enrollments: number;
}

export const emptyPurgeCounts = (): IPurgeCounts => ({
  courses: 0,
  weeks: 0,
  lessons: 0,
  muderris: 0,
  resources: 0,
  enrollments: 0,
});

/**
 * Deletes the given courses and every row under them, children first, inside
 * the caller's transaction, and returns what went.
 *
 * This is the only code that deletes a course (MDRS-124). The foreign keys
 * under a course are `ON DELETE RESTRICT`, so nothing is taken implicitly:
 * every table is named here, and a table added under a course later without
 * being added here makes this fail loudly instead of leaving orphans or
 * silently cascading. Lessons and weeks are removed whether hidden or not.
 */
export async function purgeCourses(
  tx: Tx,
  courseIds: string[]
): Promise<IPurgeCounts> {
  const counts = emptyPurgeCounts();
  if (courseIds.length === 0) return counts;

  // The courses' online exams (MDRS-299) with everything under them, and
  // their topic lists; first, since a published exam points at its celse.
  await deleteCourseOnlineExams(tx, courseIds);

  const weekIds = (
    await tx
      .select({ id: courseWeeks.id })
      .from(courseWeeks)
      .where(inArray(courseWeeks.courseId, courseIds))
  ).map((w) => w.id);

  if (weekIds.length > 0) {
    // Recordings (MDRS-162), notes and questions (MDRS-150) and a session's
    // own resources (MDRS-286), their files with them (MDRS-287), the
    // talebe's homework with its files (MDRS-290) and the homework the
    // müderris set, files and all, hang off lessons; they go first,
    // uncounted. `lesson_invitations` (MDRS-121) is left on
    // purpose: it holds no key to the lesson, and the invitation sweep reads it
    // to send each talebe the CANCEL for a session that is gone, then deletes it.
    const lessonIds = tx
      .select({ id: lessons.id })
      .from(lessons)
      .where(inArray(lessons.weekId, weekIds));
    await tx
      .delete(lessonRecordings)
      .where(inArray(lessonRecordings.lessonId, lessonIds));
    await tx
      .delete(lessonNotes)
      .where(inArray(lessonNotes.lessonId, lessonIds));
    await tx
      .delete(lessonViews)
      .where(inArray(lessonViews.lessonId, lessonIds));
    await tx
      .delete(lessonQuestions)
      .where(inArray(lessonQuestions.lessonId, lessonIds));
    await deleteLessonResources(tx, lessonIds, "course.purge");
    await deleteLessonSubmissions(tx, lessonIds, "course.purge");
    await deleteLessonAssignments(tx, lessonIds, "course.purge");
    counts.lessons = (
      await tx
        .delete(lessons)
        .where(inArray(lessons.weekId, weekIds))
        .returning({ id: lessons.id })
    ).length;
    counts.weeks = (
      await tx
        .delete(courseWeeks)
        .where(inArray(courseWeeks.id, weekIds))
        .returning({ id: courseWeeks.id })
    ).length;
  }
  // The courses' role rows (MUDERRIS, DERS_NAZIR) are no foreign-key
  // children — `scope_id` points at any kind of scope — so they are named
  // here too (MDRS-134). Not counted: `muderris` below already counts who
  // taught there.
  await deleteAssignmentsIn(tx, SCOPE_TYPES.COURSE, courseIds);
  counts.muderris = (
    await tx
      .delete(courseMuderris)
      .where(inArray(courseMuderris.courseId, courseIds))
      .returning({ id: courseMuderris.id })
  ).length;
  // A course resource that is a file (MDRS-287) leaves its object to be
  // removed from storage once this commits.
  await enqueueStorageDeletions(
    tx,
    (
      await tx
        .select({ key: courseResources.storageKey })
        .from(courseResources)
        .where(
          and(
            inArray(courseResources.courseId, courseIds),
            isNotNull(courseResources.storageKey)
          )
        )
    ).map((r) => r.key),
    "course.purge"
  );
  counts.resources = (
    await tx
      .delete(courseResources)
      .where(inArray(courseResources.courseId, courseIds))
      .returning({ id: courseResources.id })
  ).length;
  // A partner application's codes for the courses and the registrations
  // linked to them; uncounted, like the lessons' children. A DELETE from the
  // partner afterwards finds no link and removes nothing.
  await tx
    .delete(partnerEnrollmentLinks)
    .where(inArray(partnerEnrollmentLinks.courseId, courseIds));
  await tx
    .delete(partnerCourseCodes)
    .where(inArray(partnerCourseCodes.courseId, courseIds));
  counts.enrollments = (
    await tx
      .delete(enrollments)
      .where(inArray(enrollments.courseId, courseIds))
      .returning({ userId: enrollments.userId })
  ).length;
  counts.courses = (
    await tx
      .delete(courses)
      .where(inArray(courses.id, courseIds))
      .returning({ id: courses.id })
  ).length;
  return counts;
}

/**
 * Deletes the online exams of the given courses (MDRS-299), uncounted: the
 * talebe's notes on their questions (MDRS-248, soru notları), the
 * talebe's solving of the çalışma setleri with their answers (MDRS-248),
 * the talebe's attempts with their answers and switches and their zeroth answers,
 * the questions with options and topics, the zeroth options and picked
 * topics, then the courses' topic lists.
 */
export async function deleteCourseOnlineExams(
  tx: Tx,
  courseIds: string[]
): Promise<void> {
  // The talebe's notes on the questions first (MDRS-248, soru notları):
  // they hold keys to the sets and their questions.
  await tx
    .delete(questionNotes)
    .where(inArray(questionNotes.courseId, courseIds));
  // The çalışma setleri's attempts next (MDRS-248): they hold keys to the
  // sets and their questions.
  const practiceIds = tx
    .select({ id: practiceAttempts.id })
    .from(practiceAttempts)
    .where(inArray(practiceAttempts.courseId, courseIds));
  await tx
    .delete(practiceAnswers)
    .where(inArray(practiceAnswers.attemptId, practiceIds));
  await tx
    .delete(practiceAttempts)
    .where(inArray(practiceAttempts.courseId, courseIds));
  const examIds = tx
    .select({ id: onlineExams.id })
    .from(onlineExams)
    .where(inArray(onlineExams.courseId, courseIds));
  const questionIds = tx
    .select({ id: examQuestions.id })
    .from(examQuestions)
    .where(inArray(examQuestions.examId, examIds));
  // The talebe's sittings first: they hold keys to the questions and options.
  const attemptIds = tx
    .select({ id: examAttempts.id })
    .from(examAttempts)
    .where(inArray(examAttempts.examId, examIds));
  await tx
    .delete(examAnswers)
    .where(inArray(examAnswers.attemptId, attemptIds));
  await tx
    .delete(examTabSwitches)
    .where(inArray(examTabSwitches.attemptId, attemptIds));
  await tx.delete(examAttempts).where(inArray(examAttempts.examId, examIds));
  await tx.delete(zerothAnswers).where(inArray(zerothAnswers.examId, examIds));
  await tx
    .delete(examOptions)
    .where(inArray(examOptions.questionId, questionIds));
  await tx
    .delete(examQuestionTopics)
    .where(inArray(examQuestionTopics.questionId, questionIds));
  await tx.delete(examQuestions).where(inArray(examQuestions.examId, examIds));
  await tx.delete(zerothOptions).where(inArray(zerothOptions.examId, examIds));
  await tx
    .delete(onlineExamTopics)
    .where(inArray(onlineExamTopics.examId, examIds));
  await tx.delete(onlineExams).where(inArray(onlineExams.courseId, courseIds));
  await tx
    .delete(courseExamTopics)
    .where(inArray(courseExamTopics.courseId, courseIds));
  // The course's own zeroth question (its medrese's stays with the medrese).
  await tx
    .delete(courseZerothOptions)
    .where(inArray(courseZerothOptions.courseId, courseIds));
  await tx
    .delete(courseZerothQuestions)
    .where(inArray(courseZerothQuestions.courseId, courseIds));
}

/**
 * Deletes the resources of the given lessons (MDRS-286) inside the caller's
 * transaction, and marks the objects of those that are files (MDRS-287) for
 * removal from storage once it commits. Shared by every purge that deletes
 * lessons: the course's, and the archive's week and session.
 */
export async function deleteLessonResources(
  tx: Tx,
  lessonIds: SQLWrapper | string[],
  reason: DeletionReason
): Promise<void> {
  const files = await tx
    .select({ key: lessonResources.storageKey })
    .from(lessonResources)
    .where(
      and(
        inArray(lessonResources.lessonId, lessonIds),
        isNotNull(lessonResources.storageKey)
      )
    );
  await enqueueStorageDeletions(
    tx,
    files.map((f) => f.key),
    reason
  );
  await tx
    .delete(lessonResources)
    .where(inArray(lessonResources.lessonId, lessonIds));
}

/**
 * Deletes the talebe's homework on the given lessons (MDRS-290), files first
 * (theirs and the course team's review files),
 * inside the caller's transaction, and marks every file's object for removal
 * from storage once it commits. Shared by every purge that deletes lessons.
 */
export async function deleteLessonSubmissions(
  tx: Tx,
  lessonIds: SQLWrapper | string[],
  reason: DeletionReason
): Promise<void> {
  const submissionIds = tx
    .select({ id: lessonSubmissions.id })
    .from(lessonSubmissions)
    .where(inArray(lessonSubmissions.lessonId, lessonIds));
  const removed = await tx
    .delete(submissionFiles)
    .where(inArray(submissionFiles.submissionId, submissionIds))
    .returning({ key: submissionFiles.storageKey });
  // The course team's review files go with the homework they answer.
  const reviewed = await tx
    .delete(submissionReviewFiles)
    .where(inArray(submissionReviewFiles.submissionId, submissionIds))
    .returning({ key: submissionReviewFiles.storageKey });
  await enqueueStorageDeletions(
    tx,
    [...removed, ...reviewed].map((f) => f.key),
    reason
  );
  await tx
    .delete(lessonSubmissions)
    .where(inArray(lessonSubmissions.lessonId, lessonIds));
}

/**
 * Deletes the homework the müderris set on the given lessons, the course
 * team's marks on it (MDRS-248) and its files first, inside the caller's transaction, and marks every file's object for removal
 * from storage once it commits. Shared by every purge that deletes lessons,
 * so it also deletes what makes any of them an exam (`deleteLessonExams`).
 */
export async function deleteLessonAssignments(
  tx: Tx,
  lessonIds: SQLWrapper | string[],
  reason: DeletionReason
): Promise<void> {
  await deleteLessonExams(tx, lessonIds);
  const assignmentIds = tx
    .select({ id: lessonAssignments.id })
    .from(lessonAssignments)
    .where(inArray(lessonAssignments.lessonId, lessonIds));
  await tx
    .delete(assignmentEvaluations)
    .where(inArray(assignmentEvaluations.assignmentId, assignmentIds));
  const removed = await tx
    .delete(lessonAssignmentFiles)
    .where(inArray(lessonAssignmentFiles.assignmentId, assignmentIds))
    .returning({ key: lessonAssignmentFiles.storageKey });
  await enqueueStorageDeletions(
    tx,
    removed.map((f) => f.key),
    reason
  );
  await tx
    .delete(lessonAssignments)
    .where(inArray(lessonAssignments.lessonId, lessonIds));
}

/**
 * Deletes the exam rows of the given lessons (MDRS-248), their results first,
 * inside the caller's transaction. Nothing of an exam is held in storage.
 */
export async function deleteLessonExams(
  tx: Tx,
  lessonIds: SQLWrapper | string[]
): Promise<void> {
  const examIds = tx
    .select({ id: lessonExams.id })
    .from(lessonExams)
    .where(inArray(lessonExams.lessonId, lessonIds));
  await tx.delete(examResults).where(inArray(examResults.examId, examIds));
  // An online exam (MDRS-299) whose celse goes is a draft again: it keeps its
  // questions, and the restricting key to the celse is cleared first.
  await tx
    .update(onlineExams)
    .set({
      lessonId: null,
      publishedAt: null,
      latestStartAt: null,
      version: sql`${onlineExams.version} + 1`,
      updatedAt: new Date(),
    })
    .where(inArray(onlineExams.lessonId, lessonIds));
  await tx.delete(lessonExams).where(inArray(lessonExams.lessonId, lessonIds));
}

/**
 * Deletes one session and everything that hangs off it, inside the caller's
 * transaction, as the archive's session purge does. Used when an online
 * exam's publication is taken back before it opens (MDRS-299): its draft has
 * no celse. `lesson_invitations` stays, so the sweep sends the CANCEL.
 */
export async function deleteSession(
  tx: Tx,
  lessonId: string,
  reason: DeletionReason
): Promise<void> {
  const ids = [lessonId];
  await tx
    .delete(lessonRecordings)
    .where(inArray(lessonRecordings.lessonId, ids));
  await tx.delete(lessonNotes).where(inArray(lessonNotes.lessonId, ids));
  await tx
    .delete(lessonQuestions)
    .where(inArray(lessonQuestions.lessonId, ids));
  await deleteLessonResources(tx, ids, reason);
  await deleteLessonSubmissions(tx, ids, reason);
  await deleteLessonAssignments(tx, ids, reason);
  await tx.delete(lessons).where(eq(lessons.id, lessonId));
}

/** The ids of every course of a köşk, hidden or not. */
export async function courseIdsOfKosk(
  tx: Tx,
  koskId: string
): Promise<string[]> {
  return (
    await tx
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.koskId, koskId))
  ).map((c) => c.id);
}

/** One `audit_log` row, written in the same transaction as the delete. */
export async function recordDeletion(
  tx: Tx,
  entry: {
    actorId: string;
    entity: string;
    entityId: string;
    details: Record<string, unknown>;
  }
): Promise<void> {
  await tx.insert(auditLog).values({
    actorId: entry.actorId,
    action: `${entry.entity}.delete`,
    entity: entry.entity,
    entityId: entry.entityId,
    details: entry.details,
  });
}
