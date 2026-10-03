import { randomUUID } from "node:crypto";
import { pgClient } from "./pg-client";

/**
 * What the celse-state specs put in tedrisat's database (MDRS-162): a course
 * with one session on air, one over with a recording, one over with a recording
 * still being prepared, and a sample session with a public recording, under
 * random ids. Direct SQL for the same reason as `session-seed.ts`: the times
 * are relative to now and there is no endpoint for recordings.
 */
export interface CelseStatesFixture {
  courseId: string;
  courseTitle: string;
  streamId: string;
  sessions: {
    /** Started 14 minutes ago, with a live stream link. */
    live: { id: string; title: string };
    /** Over; ENROLLED recording, READY. */
    ended: { id: string; title: string; recordingTitle: string };
    /** Over; recording PROCESSING. */
    processing: { id: string; title: string };
    /** Over, a sample session; PUBLIC recording, READY. */
    sample: { id: string; title: string; recordingTitle: string };
  };
  meetingUrl: string;
  /** Enrolls `userId` (a Keycloak `sub`) with this status; returns what to remove. */
  enroll: (
    userId: string,
    status: "ENROLLED" | "PENDING"
  ) => Promise<() => Promise<void>>;
  remove: () => Promise<void>;
}

export async function seedCelseStates(): Promise<CelseStatesFixture> {
  const client = await pgClient();
  const id = () => randomUUID();
  const owner = id();
  const koskId = id();
  const courseId = id();
  const weeks = { w1: id(), w2: id() };
  const meetingUrl = "https://zoom.us/j/321654987";
  const streamId = "jNQXAC9IVRw";
  const s = {
    live: { id: id(), title: "Mehmûz fiiller: kara’e ve emr-i hâzır" },
    ended: {
      id: id(),
      title: "Mezîd fiiller ve bâblar",
      recordingTitle: "Mezîd fiiller ve bâblar: celse kaydı",
    },
    processing: { id: id(), title: "Hafta sonu müzakeresi" },
    sample: {
      id: id(),
      title: "Emsile-i muhtelife: sülâsî fiilin on kalıbı",
      recordingTitle: "Emsile-i muhtelife: açık ders kaydı",
    },
  };
  const courseTitle = "Emsile ve Bina (celse durumları)";

  const lesson = (
    lessonId: string,
    weekId: string,
    title: string,
    order: number,
    when: string,
    extra: { stream?: string; preview?: boolean } = {}
  ) =>
    client.query(
      `insert into lessons(id, week_id, title, type, order_index, duration_minutes, scheduled_at, meeting_url, live_stream_url, kaynak, is_preview)
       values ($1, $2, $3, 'LIVE', $4, 60, ${when}, $5, $6, 'Bina, s. 20–24', $7)`,
      [
        lessonId,
        weekId,
        title,
        order,
        meetingUrl,
        extra.stream ?? null,
        extra.preview ?? false,
      ]
    );
  const recording = (
    lessonId: string,
    title: string,
    visibility: "PUBLIC" | "ENROLLED",
    status: "READY" | "PROCESSING",
    url: string | null,
    daysAgo: number
  ) =>
    client.query(
      `insert into lesson_recordings(lesson_id, title, provider, url, duration_minutes, recorded_at, visibility, status)
       values ($1, $2, 'YOUTUBE', $3, 58, now() - ($6 || ' days')::interval, $4, $5)`,
      [lessonId, title, url, visibility, status, String(daysAgo)]
    );

  try {
    await client.query("begin");
    await client.query(
      "insert into kosks(id, owner_id, name) values ($1, $2, 'Nûruosmaniye Köşkü')",
      [koskId, owner]
    );
    await client.query(
      "insert into courses(id, kosk_id, author_id, title, status, requires_approval) values ($1, $2, $3, $4, 'PUBLISHED', true)",
      [courseId, koskId, owner, courseTitle]
    );
    await client.query(
      "insert into course_weeks(id, course_id, week_number, title, order_index) values ($1, $3, 1, 'Emsile-i muhtelife', 0), ($2, $3, 2, 'Mehmûz fiiller', 1)",
      [weeks.w1, weeks.w2, courseId]
    );
    await lesson(
      s.sample.id,
      weeks.w1,
      s.sample.title,
      0,
      "now() - interval '20 days'",
      { preview: true }
    );
    await lesson(
      s.ended.id,
      weeks.w1,
      s.ended.title,
      1,
      "now() - interval '6 days'"
    );
    await lesson(
      s.processing.id,
      weeks.w1,
      s.processing.title,
      2,
      "now() - interval '5 days'"
    );
    await lesson(
      s.live.id,
      weeks.w2,
      s.live.title,
      0,
      "now() - interval '14 minutes'",
      { stream: `https://www.youtube.com/watch?v=${streamId}` }
    );
    await recording(
      s.sample.id,
      s.sample.recordingTitle,
      "PUBLIC",
      "READY",
      "https://youtu.be/dQw4w9WgXcQ",
      19
    );
    await recording(
      s.ended.id,
      s.ended.recordingTitle,
      "ENROLLED",
      "READY",
      "https://youtu.be/9bZkp7q19f0",
      5
    );
    await recording(
      s.processing.id,
      "Hafta sonu müzakeresi: celse kaydı",
      "ENROLLED",
      "PROCESSING",
      null,
      4
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  return {
    courseId,
    courseTitle,
    streamId,
    sessions: s,
    meetingUrl,
    enroll: async (userId, status) => {
      await client.query(
        "insert into enrollments(user_id, course_id, status) values ($1, $2, $3)",
        [userId, courseId, status]
      );
      return async () => {
        await client.query(
          "delete from enrollments where user_id = $1 and course_id = $2",
          [userId, courseId]
        );
      };
    },
    remove: async () => {
      try {
        await client.query("begin");
        await client.query("delete from enrollments where course_id = $1", [
          courseId,
        ]);
        await client.query(
          "delete from lesson_recordings where lesson_id = any($1)",
          [Object.values(s).map((x) => x.id)]
        );
        await client.query("delete from lessons where week_id = any($1)", [
          Object.values(weeks),
        ]);
        await client.query("delete from course_weeks where course_id = $1", [
          courseId,
        ]);
        await client.query("delete from courses where id = $1", [courseId]);
        await client.query("delete from kosks where id = $1", [koskId]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
