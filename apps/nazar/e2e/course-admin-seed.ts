import pg from "pg";
import { type NazarFixture, type NazirRoles, seedPortal } from "./seed";

/**
 * What the Ders nazırları and Ders ayarları specs (MDRS-270) need beside the
 * portal's seed (`seed.ts`): grants made behind the page's back, a medrese
 * whose başmüderris has left (MDRS-136), a recording a visitor may watch, and
 * reads of what the routes wrote. Direct SQL, as in the other seeds: there is
 * no endpoint that does this for a test. `remove` also takes out what the
 * course routes wrote (posts, grants, audit rows) before the portal's rows.
 */
export interface CourseAdminFixture extends NazarFixture {
  /** Gives `user` these codes in the course, as the müderris would; returns what takes them back. */
  grant: (
    user: string,
    courseId: string,
    codes: readonly string[]
  ) => Promise<() => Promise<void>>;
  /** The ders nazırı posts `user` holds in the course now. */
  postsOf: (
    user: string,
    courseId: string
  ) => Promise<Array<{ id: string; expires_at: Date | null }>>;
  /** The codes `user` holds by a grant in the course now, sorted, with their end. */
  grantsOf: (
    user: string,
    courseId: string
  ) => Promise<Array<{ permission: string; expires_at: Date | null }>>;
  /**
   * The medrese's başmüderris leaves and nobody follows: the medrese and its
   * courses turn passive (MDRS-136). Returns what seats him again.
   */
  makeMedresePassive: () => Promise<() => Promise<void>>;
  /** A PUBLIC, READY recording on the first course's second session; returns what takes it out. */
  addPublicRecording: (title: string) => Promise<() => Promise<void>>;
  /** The course's stored settings. */
  courseOf: (courseId: string) => Promise<{
    is_closed: boolean;
    requires_approval: boolean;
    time_zone: string;
    status: string;
    sample: string | null;
  }>;
}

export async function seedCourseAdmin(
  roles: NazirRoles
): Promise<CourseAdminFixture> {
  const portal = await seedPortal(roles);
  const client = new pg.Client({
    connectionString: process.env.E2E_DATABASE_URL,
  });
  await client.connect();
  const courseIds = [portal.first.id, portal.second.id];
  const live =
    "revoked_at is null and (expires_at is null or expires_at > now())";

  return {
    ...portal,
    grant: async (user, courseId, codes) => {
      const { rows } = await client.query(
        `insert into permission_grants(user_id, scope_type, scope_id, permission, granted_by, authority_scope_type)
         select $1, 'course', $2, code, $3, 'course' from unnest($4::text[]) as code returning id`,
        [user, courseId, roles.basmuderris, codes]
      );
      return async () => {
        await client.query("delete from permission_grants where id = any($1)", [
          rows.map((row) => row.id),
        ]);
      };
    },
    postsOf: async (user, courseId) =>
      (
        await client.query(
          `select id, expires_at from role_assignments
            where user_id = $1 and scope_id = $2 and role = 'DERS_NAZIR' and ${live}`,
          [user, courseId]
        )
      ).rows,
    grantsOf: async (user, courseId) =>
      (
        await client.query(
          `select permission, expires_at from permission_grants
            where user_id = $1 and scope_id = $2 and ${live}
            order by permission`,
          [user, courseId]
        )
      ).rows,
    makeMedresePassive: async () => {
      await client.query(
        "update role_assignments set revoked_at = now(), revoked_by = $1 where scope_id = $2 and role = 'MEDRESE_BASMUDERRIS'",
        [roles.basmuderris, portal.madrasah.id]
      );
      return async () => {
        await client.query(
          "update role_assignments set revoked_at = null, revoked_by = null where scope_id = $1 and role = 'MEDRESE_BASMUDERRIS'",
          [portal.madrasah.id]
        );
      };
    },
    addPublicRecording: async (title) => {
      const {
        rows: [recording],
      } = await client.query(
        `insert into lesson_recordings(lesson_id, title, provider, url, duration_minutes, recorded_at, visibility, status)
         select l.id, $2, 'YOUTUBE', 'https://youtu.be/dQw4w9WgXcQ', 52, now() - interval '1 day', 'PUBLIC', 'READY'
           from lessons l join course_weeks w on w.id = l.week_id
          where w.course_id = $1 and l.title = 'Celse 2'
         returning id`,
        [portal.first.id, title]
      );
      return async () => {
        await client.query("delete from lesson_recordings where id = $1", [
          recording.id,
        ]);
      };
    },
    courseOf: async (courseId) =>
      (
        await client.query(
          `select c.is_closed, c.requires_approval, c.time_zone, c.status::text as status,
                  (select l.title from lessons l join course_weeks w on w.id = l.week_id
                    where w.course_id = c.id and l.is_preview) as sample
             from courses c where c.id = $1`,
          [courseId]
        )
      ).rows[0],
    remove: async () => {
      try {
        await client.query(
          "delete from lesson_recordings where lesson_id in (select l.id from lessons l join course_weeks w on w.id = l.week_id where w.course_id = any($1))",
          [courseIds]
        );
        await client.query(
          "delete from permission_grants where scope_id = any($1)",
          [courseIds]
        );
        await client.query("delete from audit_log where entity_id = any($1)", [
          courseIds,
        ]);
      } finally {
        await client.end();
      }
      await portal.remove();
    },
  };
}
