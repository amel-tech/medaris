import {
  type PracticeAttemptResponse,
  type PracticeSetSummaryResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { memberApi, reauthIfRefused } from "~/lib/tedrisat-api";

/**
 * Server-side reads of the çalışma soruları (MDRS-248, Faz 3), for server
 * components only, so no server action a browser could post to. The client
 * is built outside the `try`, so the sign-in redirect of a visitor is not
 * taken for a failed read (as in `online-exams/my-reads.ts`).
 */

/** Every published set of the caller's courses; null when tedrisat cannot answer. */
export const getMyPracticeSets = async (): Promise<
  PracticeSetSummaryResponse[] | null
> => {
  const { practice } = await memberApi();
  try {
    return await practice.listMyPracticeSets({ cache: "no-store" });
  } catch (error) {
    await reauthIfRefused(error);
    console.error("Error fetching the caller's practice sets:", error);
    return null;
  }
};

/**
 * One of the caller's attempts: `absent` when it is none of theirs (the API
 * answers 404 for another person's attempt), `failed` for anything else.
 */
export type PracticeAttemptRead =
  | { status: "ok"; attempt: PracticeAttemptResponse }
  | { status: "absent" }
  | { status: "failed" };

export const getPracticeAttemptRead = async (
  attemptId: string
): Promise<PracticeAttemptRead> => {
  const { practice } = await memberApi();
  try {
    const attempt = await practice.getPracticeAttempt(
      { attemptId },
      { cache: "no-store" }
    );
    return { status: "ok", attempt };
  } catch (error) {
    await reauthIfRefused(error);
    if (
      error instanceof ResponseError &&
      [400, 403, 404].includes(error.response.status)
    ) {
      return { status: "absent" };
    }
    console.error("Error fetching a practice attempt:", error);
    return { status: "failed" };
  }
};
