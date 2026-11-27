import type { AuthenticatedUser } from "@medaris/common";
import { describe, expect, it, vi } from "vitest";
import type { CourseService } from "../../../src/course/course.service";
import type { CourseNotifier } from "../../../src/course/course-notifier";
import { ExamKind } from "../../../src/online-exam/domain/online-exam";
import {
  editedAfterReply,
  hasNewReply,
  type IQuestionNote,
  noteOf,
  presentMine,
  shareOpen,
  teacherOrder,
} from "../../../src/question-note/domain/question-note";
import {
  NoteQuestionNotFoundError,
  NotesDisabledError,
  NotesShareLockedError,
} from "../../../src/question-note/errors/question-note.errors";
import type {
  INoteQuestion,
  QuestionNoteRepository,
} from "../../../src/question-note/question-note.repository";
import { QuestionNoteService } from "../../../src/question-note/question-note.service";

const at = (iso: string) => new Date(iso);

const note = (over: Partial<IQuestionNote> = {}): IQuestionNote => ({
  id: "n-1",
  courseId: "c-1",
  examId: "e-1",
  questionId: "q-1",
  userId: "u-1",
  body: "Neden B?",
  sharedWithTeacher: false,
  sharedAt: null,
  teacherReply: null,
  repliedBy: null,
  repliedAt: null,
  replySeenAt: null,
  createdAt: at("2026-11-27T08:00:00Z"),
  updatedAt: at("2026-11-27T08:00:00Z"),
  ...over,
});

describe("soru notları: the talebe's view of a note", () => {
  it("carries the note and the hoca's answer, and nothing else", () => {
    const shown = presentMine(
      note({
        sharedWithTeacher: true,
        sharedAt: at("2026-11-27T08:01:00Z"),
        teacherReply: "Çünkü kıyas.",
        repliedBy: "h-1",
        repliedAt: at("2026-11-27T09:00:00Z"),
      })
    );
    expect(shown).toEqual({
      id: "n-1",
      body: "Neden B?",
      sharedWithTeacher: true,
      sharedAt: at("2026-11-27T08:01:00Z"),
      teacherReply: "Çünkü kıyas.",
      repliedAt: at("2026-11-27T09:00:00Z"),
      newReply: true,
      updatedAt: at("2026-11-27T08:00:00Z"),
    });
  });

  it("is null beside a question with no note", () => {
    expect(noteOf(new Map(), "q-1")).toBeNull();
    expect(noteOf(new Map([["q-1", note()]]), "q-1")?.body).toBe("Neden B?");
  });

  it("reads an answer as new until the list is read after it", () => {
    const repliedAt = at("2026-11-27T09:00:00Z");
    expect(hasNewReply({ repliedAt: null, replySeenAt: null })).toBe(false);
    expect(hasNewReply({ repliedAt, replySeenAt: null })).toBe(true);
    expect(
      hasNewReply({ repliedAt, replySeenAt: at("2026-11-27T08:59:00Z") })
    ).toBe(true);
    expect(
      hasNewReply({ repliedAt, replySeenAt: at("2026-11-27T09:00:01Z") })
    ).toBe(false);
  });

  it("marks a note written again after its answer", () => {
    const repliedAt = at("2026-11-27T09:00:00Z");
    expect(
      editedAfterReply({ repliedAt, updatedAt: at("2026-11-27T08:00:00Z") })
    ).toBe(false);
    expect(
      editedAfterReply({ repliedAt, updatedAt: at("2026-11-27T10:00:00Z") })
    ).toBe(true);
    expect(editedAfterReply({ repliedAt: null, updatedAt: repliedAt })).toBe(
      false
    );
  });
});

describe("soru notları: when a note may go to the hoca", () => {
  const now = at("2026-11-27T12:00:00Z");
  const exam = {
    kind: ExamKind.EXAM,
    now,
    startsAt: at("2026-11-27T11:00:00Z"),
    latestStartAt: at("2026-11-27T11:10:00Z"),
    closedEarlyAt: null,
    anyInProgress: false,
    releasedAt: null,
  };

  it("always, on a çalışma seti", () => {
    expect(
      shareOpen({ ...exam, kind: ExamKind.PRACTICE, startsAt: null })
    ).toBe(true);
  });

  it("not while a talebe still sits the exam, nor before its late window ends", () => {
    expect(shareOpen({ ...exam, anyInProgress: true })).toBe(false);
    expect(
      shareOpen({ ...exam, latestStartAt: at("2026-11-27T12:30:00Z") })
    ).toBe(false);
    expect(shareOpen({ ...exam, startsAt: null })).toBe(false);
  });

  it("once the exam is over for everyone, closed early, or its results are open", () => {
    expect(shareOpen(exam)).toBe(true);
    expect(
      shareOpen({
        ...exam,
        anyInProgress: true,
        closedEarlyAt: at("2026-11-27T11:30:00Z"),
      })
    ).toBe(true);
    expect(
      shareOpen({
        ...exam,
        anyInProgress: true,
        releasedAt: at("2026-11-27T11:50:00Z"),
      })
    ).toBe(true);
  });
});

describe("soru notları: the hoca's order", () => {
  it("lists the unanswered first, the longest waiting first, then the latest answered", () => {
    const rows = [
      {
        id: "a",
        teacherReply: "x",
        sharedAt: at("2026-11-27T08:00:00Z"),
        repliedAt: at("2026-11-27T09:00:00Z"),
      },
      {
        id: "b",
        teacherReply: null,
        sharedAt: at("2026-11-27T10:00:00Z"),
        repliedAt: null,
      },
      {
        id: "c",
        teacherReply: "y",
        sharedAt: at("2026-11-27T08:00:00Z"),
        repliedAt: at("2026-11-27T11:00:00Z"),
      },
      {
        id: "d",
        teacherReply: null,
        sharedAt: at("2026-11-27T07:00:00Z"),
        repliedAt: null,
      },
    ];
    expect(rows.sort(teacherOrder).map((r) => r.id)).toEqual([
      "d",
      "b",
      "c",
      "a",
    ]);
  });
});

describe("QuestionNoteService.saveMine", () => {
  const user = { sub: "u-1" } as AuthenticatedUser;
  const question = (over: Partial<INoteQuestion> = {}): INoteQuestion => ({
    questionId: "q-1",
    questionText: "Soru",
    talebeNotes: true,
    examId: "e-1",
    courseId: "c-1",
    kind: ExamKind.PRACTICE,
    examTitle: "Kıyas",
    publishedAt: at("2026-11-27T08:00:00Z"),
    lessonId: null,
    startsAt: null,
    latestStartAt: null,
    closedEarlyAt: null,
    durationMinutes: null,
    ...over,
  });

  const serviceOf = (q: INoteQuestion | null, got = true) => {
    const repo = {
      findQuestion: vi.fn(async () => q),
      gotQuestion: vi.fn(async () => got),
      findMine: vi.fn(async () => null),
      anyInProgress: vi.fn(async () => true),
      releasedAt: vi.fn(async () => null),
      save: vi.fn(async (input: { sharedWithTeacher: boolean }) => ({
        note: note({
          sharedWithTeacher: input.sharedWithTeacher,
          sharedAt: input.sharedWithTeacher ? at("2026-11-27T12:00:00Z") : null,
        }),
        shared: input.sharedWithTeacher,
      })),
    };
    const courses = {
      getDetail: vi.fn(async () => ({})),
      mayWriteAsTalebe: vi.fn(async () => true),
    };
    const notifier = { questionNoteShared: vi.fn(async () => undefined) };
    const service = new QuestionNoteService(
      repo as unknown as QuestionNoteRepository,
      courses as unknown as CourseService,
      notifier as unknown as CourseNotifier
    );
    return { service, repo, notifier };
  };

  it("is NOTE_QUESTION_NOT_FOUND for a question the caller never got", async () => {
    const { service, repo } = serviceOf(question(), false);
    await expect(
      service.saveMine(user, "q-1", { body: "x", sharedWithTeacher: false })
    ).rejects.toBeInstanceOf(NoteQuestionNotFoundError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("is NOTES_DISABLED when the team turned the question's notes off", async () => {
    const { service, repo } = serviceOf(question({ talebeNotes: false }));
    await expect(
      service.saveMine(user, "q-1", { body: "x", sharedWithTeacher: false })
    ).rejects.toBeInstanceOf(NotesDisabledError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("keeps an exam's note to the talebe while the exam runs (NOTES_SHARE_LOCKED)", async () => {
    const running = question({
      kind: ExamKind.EXAM,
      lessonId: "l-1",
      startsAt: new Date(Date.now() - 60_000),
      latestStartAt: new Date(Date.now() + 600_000),
      durationMinutes: 30,
    });
    const { service, repo, notifier } = serviceOf(running);
    await expect(
      service.saveMine(user, "q-1", { body: "x", sharedWithTeacher: true })
    ).rejects.toBeInstanceOf(NotesShareLockedError);
    expect(repo.save).not.toHaveBeenCalled();
    // Kept to the talebe, it is written.
    await service.saveMine(user, "q-1", {
      body: "x",
      sharedWithTeacher: false,
    });
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(notifier.questionNoteShared).not.toHaveBeenCalled();
  });

  it("tells the hoca when a çalışma seti's note is sent", async () => {
    const { service, notifier } = serviceOf(question());
    const saved = await service.saveMine(user, "q-1", {
      body: "x",
      sharedWithTeacher: true,
    });
    expect(saved.sharedWithTeacher).toBe(true);
    expect(notifier.questionNoteShared).toHaveBeenCalledWith(
      { courseId: "c-1", examId: "e-1", setTitle: "Kıyas", kind: "PRACTICE" },
      "u-1"
    );
  });
});
