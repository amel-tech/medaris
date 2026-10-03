import {
  createServerTedrisatAPIs,
  type PendingEnrollmentResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

/**
 * Server-side reads behind the applications screens (nizam 31 and 57,
 * MDRS-168). Not a `"use server"` module: only server components call them. A
 * failed read is `null` so the page shows its error state instead of a crash;
 * a refusal and a missing köşk are told apart, because the page treats them
 * the same on purpose ("Bu bölüm için izniniz yok") but must not show the
 * error state for either.
 */
export type PendingRead =
  | {
      pending: PendingEnrollmentResponse[];
      /** course id to its müderris names, for the Ders column */
      muderris: Record<string, string[]>;
    }
  | "forbidden"
  | "not-found"
  | null;

export const getKoskApplications = async (
  koskId: string
): Promise<PendingRead> => {
  try {
    const api = await createServerTedrisatAPIs(
      await getAccessToken(),
      env.TEDRISAT_API_BASE_URL
    );
    const [pending, courses] = await Promise.all([
      api.courses.getPendingEnrollments({ koskId }),
      // the names beside the course titles are a nicety: a failure here must
      // not hide the applications
      api.courses.getCoursesByKosk({ koskId }).catch(() => []),
    ]);
    const muderris: Record<string, string[]> = {};
    for (const course of courses) {
      muderris[course.id] = [...course.muderris]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((m) => m.name);
    }
    return { pending, muderris };
  } catch (error) {
    if (error instanceof ResponseError) {
      if (error.response.status === 403) return "forbidden";
      if (error.response.status === 404) return "not-found";
    }
    console.error("Error fetching the köşk's applications:", error);
    return null;
  }
};
