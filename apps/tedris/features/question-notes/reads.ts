import {
  type MyQuestionNoteListItemResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { memberApi, reauthIfRefused } from "~/lib/tedrisat-api";

/**
 * The talebe's notes of one course (MDRS-248, soru notları), for the server
 * component of "Notlarım" only. The API marks every answer of the course read
 * as it answers, so this is read by that page and nowhere else: a count on
 * another page would mark the answers read before the talebe saw them.
 */
export type MyQuestionNotesRead =
  | { status: "ok"; notes: MyQuestionNoteListItemResponse[] }
  | { status: "absent" }
  | { status: "failed" };

export const getMyQuestionNotes = async (
  courseId: string
): Promise<MyQuestionNotesRead> => {
  const { questionNotes } = await memberApi();
  try {
    const notes = await questionNotes.listMyQuestionNotes(
      { id: courseId },
      { cache: "no-store" }
    );
    return { status: "ok", notes };
  } catch (error) {
    await reauthIfRefused(error);
    if (
      error instanceof ResponseError &&
      [400, 403, 404].includes(error.response.status)
    ) {
      return { status: "absent" };
    }
    console.error("Error fetching the caller's question notes:", error);
    return { status: "failed" };
  }
};
