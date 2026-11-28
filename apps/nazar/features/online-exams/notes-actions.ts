"use server";

import type {
  ExamQuestionNoteResponse,
  QuestionTalebeNotesResponse,
} from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * Talebe notları (MDRS-248), the hoca's side: the icon that lets the talebe
 * write a note on one question, and the answer to a note sent to the hoca.
 * Neither names a version: the icon is not the question's content, so it is
 * taken on a draft, a published and a locked set or exam alike.
 */

/** The icon on a question: whether its talebe may write a note on it. */
export async function setExamQuestionTalebeNotes(
  examId: string,
  questionId: string,
  talebeNotes: boolean
): Promise<ActionOutcome<QuestionTalebeNotesResponse>> {
  return outcomeOf(
    await authenticatedAction((api) =>
      api.onlineExams.setExamQuestionTalebeNotes({
        examId,
        questionId,
        setTalebeNotesDto: { talebeNotes },
      })
    )
  );
}

/** "Cevapla" / "Cevabı düzenle"; an empty reply is "Cevabı kaldır". */
export async function replyQuestionNote(
  noteId: string,
  reply: string
): Promise<ActionOutcome<ExamQuestionNoteResponse>> {
  return outcomeOf(
    await authenticatedAction((api) =>
      api.questionNotes.replyQuestionNote({
        noteId,
        replyQuestionNoteDto: { reply },
      })
    )
  );
}
