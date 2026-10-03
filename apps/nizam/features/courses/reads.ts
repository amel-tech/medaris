import {
  type CourseDetailResponse,
  createServerTedrisatAPIs,
  type KoskResponse,
  type MeResponse,
  type RecordingResponse,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getCourse, getKoskById, getMe } from "~/features/kosks/actions";
import { mayAssignMuderris } from "~/features/kosks/course-team";
import { mayEditCourse } from "~/features/kosks/kosk-abilities";
import { getAccessToken } from "~/lib/auth_options";

/**
 * What every course page (ayarlar, müfredat, celseler, celse planla) needs
 * before it draws anything: the köşk, the course and who is asking. Not a
 * `"use server"` module: only the pages call it.
 *
 * `missing` is the 404 (a course of another köşk is not found here), `denied`
 * the 403: a caller who is neither the köşk's manager nor one of the course's
 * müderris. Both draw the same "Bu bölüm için izniniz yok" screen (nizam/06).
 * `failed` is the API being down.
 */
export type CourseScope =
  | {
      kind: "ok";
      kosk: KoskResponse;
      course: CourseDetailResponse;
      me: MeResponse;
      /** may change who teaches the course, hide it and set köşk policy */
      manager: boolean;
    }
  | { kind: "missing" }
  | { kind: "denied" }
  | { kind: "failed" };

export async function readCourseScope(
  koskId: string,
  courseId: string
): Promise<CourseScope> {
  const [kosk, course, me] = await Promise.all([
    getKoskById(koskId),
    getCourse(courseId),
    getMe(),
  ]);
  if (!kosk && !course) return { kind: "failed" };
  if (!kosk || !course || course.koskId !== kosk.id) return { kind: "missing" };
  if (!me) return { kind: "failed" };
  if (!mayEditCourse(me, kosk.id, course.id)) return { kind: "denied" };
  return {
    kind: "ok",
    kosk,
    course,
    me,
    manager: mayAssignMuderris(me, kosk.id),
  };
}

/** The recordings of a course, for the count in the past sessions; empty when unread. */
export async function getRecordings(
  courseId: string
): Promise<RecordingResponse[]> {
  try {
    const { lessons } = await createServerTedrisatAPIs(
      await getAccessToken(),
      env.TEDRISAT_API_BASE_URL
    );
    return await lessons.listCourseRecordings({ id: courseId });
  } catch (error) {
    console.error("Error fetching the course recordings:", error);
    return [];
  }
}
