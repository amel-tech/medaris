import { randomUUID } from "node:crypto";
import { pgClient } from "./pg-client";
import { directGrant, type E2eAccount } from "./sign-in";

/**
 * What the notes and questions specs (MDRS-150) put in tedrisat's database,
 * under random ids, and take out again: a published course with a müderris and
 * six sessions, one in each state a talebe meets during the course, and a
 * second course whose müderris was taken off with nobody seated since, so a
 * passive scope (MDRS-136) closes its content to the talebe. Direct SQL for
 * the same reasons as `celse-states-seed.ts`: the times are relative to now
 * and there is no endpoint for a recording of a given provider.
 *
 * The Bunny recording is what a pasted player link of the dev library
 * (`769667`) stores: the video id only, made up here. Nothing calls Bunny:
 * tedrisat signs the player link itself, and the specs abort every request to
 * Bunny's hosts.
 */
export interface LessonWritingFixture {
  courseId: string;
  courseTitle: string;
  sessions: {
    /** Over 6 days ago; a READY YouTube recording for the enrolled. */
    youtube: { id: string; title: string; recordingTitle: string };
    /** Over 3 days ago; a READY Bunny recording of library 769667. */
    bunny: {
      id: string;
      title: string;
      recordingTitle: string;
      videoId: string;
    };
    /** Over yesterday, with no recording. */
    endedBare: { id: string; title: string };
    /** On air: began 14 minutes ago, with a meeting link and a YouTube live stream. */
    live: { id: string; title: string };
    /** On air: began 5 minutes ago, with a meeting link and nothing to watch. */
    liveLinkOnly: { id: string; title: string };
    /** Begins in 2 days. */
    upcoming: { id: string; title: string };
  };
  /** The passive course: one session over, with a READY YouTube recording. */
  passive: { courseId: string; sessionId: string; recordingTitle: string };
  /**
   * Sets `userId`'s enrollment in the course (or the passive one), replacing
   * any; returns what removes it.
   */
  enroll: (
    userId: string,
    status: "ENROLLED" | "PENDING" | "REVOKED",
    course?: "main" | "passive"
  ) => Promise<() => Promise<void>>;
  /** `userId`'s notes on a session, oldest first. */
  notesOf: (
    userId: string,
    lessonId: string
  ) => Promise<{ id: string; body: string; offset_seconds: number | null }[]>;
  /** `userId`'s questions in both courses, oldest first. */
  questionsOf: (userId: string) => Promise<
    {
      id: string;
      lesson_id: string;
      body: string;
      answer: string | null;
    }[]
  >;
  /** Removes every note and question written on the fixture's sessions. */
  clearWriting: () => Promise<void>;
  remove: () => Promise<void>;
}

export async function seedLessonWriting(roles: {
  /** The account seated as the course's müderris (imam); a stranger when absent. */
  muderris?: string;
}): Promise<LessonWritingFixture> {
  const client = await pgClient();
  const id = () => randomUUID();
  const owner = id();
  const muderris = roles.muderris ?? id();
  const formerMuderris = id();
  const koskId = id();
  const courseId = id();
  const passiveCourseId = id();
  const weeks = { w1: id(), w2: id(), passive: id() };
  const meetingUrl = "https://zoom.us/j/741852963";
  const courseTitle = "Bina ve İzhar Şerhi (notlar ve sorular)";
  const s = {
    youtube: {
      id: id(),
      title: "Mâzî fiilin çekimi",
      recordingTitle: "Mâzî fiilin çekimi: celse kaydı",
    },
    bunny: {
      id: id(),
      title: "Muzâri fiilin çekimi",
      recordingTitle: "Muzâri fiilin çekimi: celse kaydı",
      videoId: id(),
    },
    endedBare: { id: id(), title: "Emr-i hâzır" },
    live: { id: id(), title: "Nehy-i hâzır" },
    liveLinkOnly: { id: id(), title: "Müzakere: nehy ve nefy" },
    upcoming: { id: id(), title: "İsm-i fâil ve ism-i mef‘ûl" },
  };
  const passive = {
    courseId: passiveCourseId,
    sessionId: id(),
    recordingTitle: "Emsile: celse kaydı",
  };
  const lessonIds = [...Object.values(s).map((x) => x.id), passive.sessionId];

  const lesson = (
    lessonId: string,
    weekId: string,
    title: string,
    order: number,
    when: string,
    stream: string | null = null
  ) =>
    client.query(
      `insert into lessons(id, week_id, title, type, order_index, duration_minutes, scheduled_at, meeting_url, live_stream_url)
       values ($1, $2, $3, 'LIVE', $4, 60, ${when}, $5, $6)`,
      [lessonId, weekId, title, order, meetingUrl, stream]
    );

  try {
    await client.query("begin");
    await client.query(
      "insert into kosks(id, owner_id, name) values ($1, $2, 'Nûruosmaniye Köşkü')",
      [koskId, owner]
    );
    await client.query(
      "insert into courses(id, kosk_id, author_id, title, status) values ($1, $3, $4, $5, 'PUBLISHED'), ($2, $3, $4, 'Emsile (müderrisi ayrıldı)', 'PUBLISHED')",
      [courseId, passiveCourseId, koskId, owner, courseTitle]
    );
    await client.query(
      `insert into course_weeks(id, course_id, week_number, title, order_index) values
       ($1, $4, 1, 'Mâzî ve muzâri', 0), ($2, $4, 2, 'Emir ve nehy', 1), ($3, $5, 1, 'Emsile', 0)`,
      [weeks.w1, weeks.w2, weeks.passive, courseId, passiveCourseId]
    );
    await lesson(
      s.youtube.id,
      weeks.w1,
      s.youtube.title,
      0,
      "now() - interval '6 days'"
    );
    await lesson(
      s.bunny.id,
      weeks.w1,
      s.bunny.title,
      1,
      "now() - interval '3 days'"
    );
    await lesson(
      s.endedBare.id,
      weeks.w1,
      s.endedBare.title,
      2,
      "now() - interval '1 day'"
    );
    await lesson(
      s.live.id,
      weeks.w2,
      s.live.title,
      0,
      "now() - interval '14 minutes'",
      "https://www.youtube.com/watch?v=jNQXAC9IVRw"
    );
    await lesson(
      s.liveLinkOnly.id,
      weeks.w2,
      s.liveLinkOnly.title,
      1,
      "now() - interval '5 minutes'"
    );
    await lesson(
      s.upcoming.id,
      weeks.w2,
      s.upcoming.title,
      2,
      "now() + interval '2 days'"
    );
    await lesson(
      passive.sessionId,
      weeks.passive,
      "Emsile-i muhtelife",
      0,
      "now() - interval '2 days'"
    );
    await client.query(
      `insert into lesson_recordings(lesson_id, title, provider, url, duration_minutes, recorded_at, visibility, status) values
       ($1, $2, 'YOUTUBE', 'https://youtu.be/9bZkp7q19f0', 58, now() - interval '6 days', 'ENROLLED', 'READY'),
       ($3, $4, 'YOUTUBE', 'https://youtu.be/dQw4w9WgXcQ', 55, now() - interval '2 days', 'ENROLLED', 'READY')`,
      [
        s.youtube.id,
        s.youtube.recordingTitle,
        passive.sessionId,
        passive.recordingTitle,
      ]
    );
    // A pasted Bunny link stores the video id alone (MDRS-119).
    await client.query(
      `insert into lesson_recordings(lesson_id, title, provider, url, bunny_video_id, upload_expires_at, duration_minutes, recorded_at, visibility, status)
       values ($1, $2, 'BUNNY', null, $3, now(), 57, now() - interval '3 days', 'ENROLLED', 'READY')`,
      [s.bunny.id, s.bunny.recordingTitle, s.bunny.videoId]
    );
    await client.query(
      "insert into course_muderris(course_id, user_id, name, title) values ($1, $2, 'Abdülhamit Karaosmanoğlu', 'Müderris')",
      [courseId, muderris]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, is_imam, granted_by) values ($1, 'MUDERRIS', 'course', $2, true, $3)",
      [muderris, courseId, owner]
    );
    // The passive course: it had a müderris, and nobody holds the post now.
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, is_imam, granted_by, revoked_at, revoked_by) values ($1, 'MUDERRIS', 'course', $2, true, $3, now(), $3)",
      [formerMuderris, passiveCourseId, owner]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  const clearWriting = async () => {
    await client.query("delete from lesson_notes where lesson_id = any($1)", [
      lessonIds,
    ]);
    await client.query(
      "delete from lesson_questions where lesson_id = any($1)",
      [lessonIds]
    );
  };

  return {
    courseId,
    courseTitle,
    sessions: s,
    passive,
    enroll: async (userId, status, course = "main") => {
      const target = course === "main" ? courseId : passiveCourseId;
      await client.query(
        "delete from enrollments where user_id = $1 and course_id = $2",
        [userId, target]
      );
      await client.query(
        "insert into enrollments(user_id, course_id, status) values ($1, $2, $3)",
        [userId, target, status]
      );
      return async () => {
        await client.query(
          "delete from enrollments where user_id = $1 and course_id = $2",
          [userId, target]
        );
      };
    },
    notesOf: async (userId, lessonId) =>
      (
        await client.query(
          "select id, body, offset_seconds from lesson_notes where author_id = $1 and lesson_id = $2 order by created_at",
          [userId, lessonId]
        )
      ).rows,
    questionsOf: async (userId) =>
      (
        await client.query(
          "select id, lesson_id, body, answer from lesson_questions where author_id = $1 and lesson_id = any($2) order by created_at",
          [userId, lessonIds]
        )
      ).rows,
    clearWriting,
    remove: async () => {
      try {
        await client.query("begin");
        await clearWriting();
        await client.query(
          "delete from enrollments where course_id = any($1)",
          [[courseId, passiveCourseId]]
        );
        await client.query(
          "delete from role_assignments where scope_id = any($1)",
          [[courseId, passiveCourseId]]
        );
        await client.query(
          "delete from lesson_recordings where lesson_id = any($1)",
          [lessonIds]
        );
        await client.query("delete from lessons where id = any($1)", [
          lessonIds,
        ]);
        await client.query(
          "delete from course_weeks where course_id = any($1)",
          [[courseId, passiveCourseId]]
        );
        await client.query("delete from course_muderris where course_id = $1", [
          courseId,
        ]);
        await client.query("delete from courses where id = any($1)", [
          [courseId, passiveCourseId],
        ]);
        await client.query("delete from kosks where id = $1", [koskId]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}

/** A Keycloak account from E2E_<ROLE>_EMAIL, _PASSWORD and _SUB. */
export const account = (role: string): E2eAccount & { sub?: string } => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});

export const talebe = account("TALEBE");
export const muderris = account("MUDERRIS");
/** The başnazım: SYSTEM_ADMIN in the realm. */
export const basnazim = account("SISTEM_ADMIN");
/**
 * A second person who is neither the talebe nor the müderris, to enroll or
 * not as a test needs: E2E_OTHER, unless it is one of those two (on the dev
 * realm it is the müderris's account), else the medrese nazırı's, who holds
 * nothing in these courses.
 */
export const second =
  [account("OTHER"), account("MEDRESE_NAZIR")].find(
    (who) => who.sub && who.sub !== talebe.sub && who.sub !== muderris.sub
  ) ?? {};

/** Whether every one of these accounts is in the environment. */
export const ready = (...who: { email?: string; sub?: string }[]) =>
  who.every((w) => Boolean(w.email && w.sub));

const API = process.env.E2E_TEDRISAT_URL ?? "http://localhost:3001";

/** tedrisat as `who`, with a token of their own from the direct grant. */
export async function api(
  who: E2eAccount,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; code?: string; data: unknown }> {
  const token = (await directGrant(who)).access_token;
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, code: data?.code ?? data?.error?.code, data };
}
