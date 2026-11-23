import {
  createServerTedrisatAPIs,
  type ExamBriefingResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth";

/**
 * The briefing of a celse's online exam (MDRS-299), read by server
 * components only, so not a server action a browser could post to. A celse
 * that is no published online exam, or one the caller holds no seat in, is
 * `absent`; any other failure is `failed`, so the page can offer a retry
 * rather than say there is no exam.
 */
export type BriefingRead =
  | { status: "ok"; briefing: ExamBriefingResponse }
  | { status: "absent" }
  | { status: "failed" };

export async function readBriefing(lessonId: string): Promise<BriefingRead> {
  try {
    const api = await createServerTedrisatAPIs(
      await getAccessToken(),
      env.TEDRISAT_API_BASE_URL
    );
    const briefing = await api.onlineExamAttempts.getExamBriefing(
      { id: lessonId },
      { cache: "no-store" }
    );
    return { status: "ok", briefing };
  } catch (error) {
    if (
      error instanceof ResponseError &&
      [403, 404].includes(error.response.status)
    ) {
      return { status: "absent" };
    }
    return { status: "failed" };
  }
}
