import {
  type CourseDetailResponse,
  createServerTedrisatAPIs,
  type KoskResponse,
  type MeResponse,
  type RecordingResponse,
  ResponseError,
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

/**
 * The course's live stream links by session id (MDRS-228), or `null` when the
 * caller may not set them — which hides the "Canlı yayın" control.
 *
 * Who may is tedrisat's answer, not one worked out here: the route is
 * `session.live_link`'s, and it answers 403 to anyone else. nizam's other
 * course buttons are drawn from `GET /me`'s roles (`kosk-abilities.ts`), but
 * this permission can also be given to a ders nazırı, and `/me` and
 * `/me/effective-permissions` neither name the courses a köşk nazımı's
 * `course.manage_all` covers nor the başnazım, so the rule would have to be
 * written a second time. A failed read hides the control as well: without the
 * links the rows could not say which session has one.
 */
export async function getLiveStreams(
  courseId: string
): Promise<Record<string, string> | null> {
  try {
    const { lessons } = await createServerTedrisatAPIs(
      await getAccessToken(),
      env.TEDRISAT_API_BASE_URL
    );
    const links = await lessons.listCourseLiveStreams({ id: courseId });
    return Object.fromEntries(
      links.flatMap((l) =>
        l.liveStreamUrl ? [[l.lessonId, l.liveStreamUrl] as const] : []
      )
    );
  } catch (error) {
    if (!(error instanceof ResponseError && error.response.status === 403)) {
      console.error("Error fetching the course's live stream links:", error);
    }
    return null;
  }
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
