import {
  type MyExamResponse,
  type MyExamResultResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { memberApi, reauthIfRefused } from "~/lib/tedrisat-api";

/**
 * Server-side reads of a talebe's own exams (MDRS-299): Sınavlarım and the
 * screen of a past exam. Not a `"use server"` module: only server components
 * call these. The client is built outside the `try`, so the sign-in redirect
 * of a visitor is not taken for a failed read; a token tedrisat refused is
 * sign-in for new tokens (`reauthIfRefused`).
 */

/** Null when tedrisat cannot answer, so the page can say so instead of drawing an empty list. */
export const getMyExams = async (): Promise<MyExamResponse[] | null> => {
  const { myExams } = await memberApi();
  try {
    return await myExams.listMyExams({ cache: "no-store" });
  } catch (error) {
    await reauthIfRefused(error);
    console.error("Error fetching the caller's exams:", error);
    return null;
  }
};

/**
 * The caller's screen of one past exam: `absent` when it is no exam of
 * theirs (none taken, not a published online exam, no seat); `failed` for
 * anything else, so the page offers a retry rather than say there is none.
 */
export type MyResultRead =
  | { status: "ok"; result: MyExamResultResponse }
  | { status: "absent" }
  | { status: "failed" };

export const getMyExamResult = async (
  lessonId: string
): Promise<MyResultRead> => {
  const { myExams } = await memberApi();
  try {
    const result = await myExams.getMyExamResult(
      { id: lessonId },
      { cache: "no-store" }
    );
    return { status: "ok", result };
  } catch (error) {
    await reauthIfRefused(error);
    if (
      error instanceof ResponseError &&
      [403, 404].includes(error.response.status)
    ) {
      return { status: "absent" };
    }
    console.error("Error fetching the caller's exam result:", error);
    return { status: "failed" };
  }
};
