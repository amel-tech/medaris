import { randomUUID } from "node:crypto";
import { pgClient } from "./pg-client";

/**
 * What the Keşfet, köşk page and Derslerim specs put in tedrisat's database
 * (MDRS-159), under random ids and a random tag in every name, so a spec scopes
 * itself with `?q=<tag>` on a database that already holds other köşks. Direct
 * SQL, like the medrese fixture: nothing here is reachable through the API
 * without a Keycloak admin login. `remove` takes it all out again.
 */
export interface DiscoverFixture {
  /** In every köşk and medrese name of the main set. */
  tag: string;
  /** In the names of the 13 köşks that fill two pages. */
  pageTag: string;
  kosks: {
    nur: { id: string; name: string; field: string };
    fatih: { id: string; name: string; field: string };
    beyazit: { id: string; name: string; field: string };
  };
  madrasahs: {
    suleymaniye: { id: string; name: string; headName: string };
    zeyrek: { id: string; name: string };
  };
  courses: Record<
    "emsile" | "avamil" | "bina" | "draft" | "isagoji" | "siyer" | "tecvid",
    { id: string; title: string }
  >;
  deckTitle: string;
  /** Gives `userId` the talebe's side of the story: see `seedTalebe`. */
  seedTalebe: (userId: string) => Promise<void>;
  remove: () => Promise<void>;
}

const tagOf = () => randomUUID().slice(0, 6);

export async function seedDiscover(): Promise<DiscoverFixture> {
  const client = await pgClient();
  const id = () => randomUUID();
  const tag = tagOf();
  const pageTag = tagOf();
  const admin = id();
  const head = id();
  const headName = `Mehmet Emin Işıkoğlu ${tag}`;

  const kosks = {
    nur: {
      id: id(),
      name: `Nûruosmaniye Köşkü ${tag}`,
      field: `Arapça ${tag}`,
    },
    fatih: { id: id(), name: `Fatih Köşkü ${tag}`, field: `Fıkıh ${tag}` },
    beyazit: { id: id(), name: `Beyazıt Köşkü ${tag}`, field: `Hadis ${tag}` },
  };
  const madrasahs = {
    suleymaniye: {
      id: id(),
      name: `Süleymaniye Medresesi ${tag}`,
      headName,
    },
    zeyrek: { id: id(), name: `Zeyrek Medresesi ${tag}` },
  };
  const courses = {
    emsile: { id: id(), title: `Emsile ve Bina ${tag}` },
    avamil: { id: id(), title: `Avâmil ve Tasrîf ${tag}` },
    bina: { id: id(), title: `Bina ve İzhar Şerhi ${tag}` },
    draft: { id: id(), title: `Taslak ders ${tag}` },
    isagoji: { id: id(), title: `İsâgûcî ile mantığa giriş ${tag}` },
    siyer: { id: id(), title: `Siyer okumaları ${tag}` },
    tecvid: { id: id(), title: `Tecvid tatbikatı ${tag}` },
  };
  const courseIds = Object.values(courses).map((c) => c.id);
  const koskIds = Object.values(kosks).map((k) => k.id);
  const madrasahIds = Object.values(madrasahs).map((m) => m.id);
  const deckId = id();
  const deckTitle = `Sarfın temel kelimeleri ${tag}`;
  const weeks = { emsile: id(), bina: id(), siyer: id() };
  let talebe: string | null = null;

  try {
    await client.query("begin");
    await client.query(
      "insert into users(id, given_name, family_name) values ($1, 'Mehmet Emin', $2)",
      [head, `Işıkoğlu ${tag}`]
    );
    const level: Record<string, string> = {
      nur: "BEGINNER",
      fatih: "INTERMEDIATE",
      beyazit: "BEGINNER",
    };
    for (const [key, k] of Object.entries(kosks)) {
      await client.query(
        "insert into kosks(id, owner_id, name, field, level, description) values ($1, $2, $3, $4, $5, $6)",
        [
          k.id,
          admin,
          k.name,
          k.field,
          level[key],
          `${k.field} dersleri için bir köşk.`,
        ]
      );
    }
    const medrese = madrasahs.suleymaniye;
    await client.query(
      "insert into madrasahs(id, handle, name, created_by) values ($1, $2, $3, $4), ($5, $6, $7, $4)",
      [
        medrese.id,
        `e2e-s-${tag}`,
        medrese.name,
        admin,
        madrasahs.zeyrek.id,
        `e2e-z-${tag}`,
        madrasahs.zeyrek.name,
      ]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values ($1, 'MEDRESE_BASMUDERRIS', 'madrasah', $2, $3)",
      [head, medrese.id, admin]
    );
    const insertCourse = (
      course: { id: string; title: string },
      koskId: string,
      madrasahId: string | null,
      category: string,
      status = "PUBLISHED"
    ) =>
      client.query(
        "insert into courses(id, kosk_id, madrasah_id, author_id, title, category, status) values ($1, $2, $3, $4, $5, $6, $7)",
        [course.id, koskId, madrasahId, admin, course.title, category, status]
      );
    await insertCourse(courses.emsile, kosks.nur.id, null, "الصرف");
    await insertCourse(courses.avamil, kosks.nur.id, null, "النحو");
    await insertCourse(courses.bina, kosks.nur.id, medrese.id, "الصرف");
    await insertCourse(courses.draft, kosks.nur.id, null, "x", "DRAFT");
    await insertCourse(courses.isagoji, kosks.fatih.id, medrese.id, "المنطق");
    await insertCourse(courses.siyer, kosks.beyazit.id, null, "السيرة");
    await insertCourse(courses.tecvid, kosks.beyazit.id, null, "التجويد");
    for (const key of ["emsile", "bina", "siyer"] as const) {
      await client.query(
        "insert into course_weeks(id, course_id, week_number, title) values ($1, $2, 5, 'Beşinci hafta')",
        [weeks[key], courses[key].id]
      );
      await client.query(
        "insert into lessons(week_id, title, type, scheduled_at) values ($1, 'Celse', 'LIVE', now() + interval '2 days')",
        [weeks[key]]
      );
    }
    for (const c of [courses.bina, courses.isagoji]) {
      await client.query(
        "insert into course_muderris(course_id, user_id, name) values ($1, $2, $3)",
        [c.id, head, headName]
      );
      await client.query(
        "insert into role_assignments(user_id, role, scope_type, scope_id, is_imam, granted_by) values ($1, 'MUDERRIS', 'course', $2, true, $3)",
        [head, c.id, admin]
      );
    }
    await client.query(
      "insert into decks(id, author_id, title, is_public, kosk_id) values ($1, $2, $3, true, $4)",
      [deckId, admin, deckTitle, kosks.nur.id]
    );
    await client.query(
      "insert into flashcards(deck_id, author_id, type, content_front, content_back) select $1, $2, 'VOCABULARY', 'ön ' || n, 'arka ' || n from generate_series(1, 3) n",
      [deckId, admin]
    );
    await client.query(
      "insert into kosks(id, owner_id, name, field, level) select gen_random_uuid(), $1, 'Sayfa ' || $2 || ' ' || n, 'Sayfa ' || $2, 'ALL' from generate_series(1, 13) n",
      [admin, pageTag]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  return {
    tag,
    pageTag,
    kosks,
    madrasahs,
    courses,
    deckTitle,
    /**
     * Enrolled in Emsile ve Bina, Bina ve İzhar Şerhi and Siyer okumaları
     * (40, 15 and 20 percent, a session in week 5 each), waiting for approval
     * in İsâgûcî, completed in Tecvid on 26 September 2026; following the
     * Nûruosmaniye köşk and not Beyazıt; with the köşk's deck in the
     * collection.
     */
    seedTalebe: async (userId: string) => {
      talebe = userId;
      await client.query("begin");
      try {
        const enroll = (
          course: { id: string },
          status: string,
          progress: number,
          completedAt: string | null = null
        ) =>
          client.query(
            "insert into enrollments(user_id, course_id, status, progress, completed_at, created_at) values ($1, $2, $3, $4, $5, '2026-09-28 09:00:00')",
            [userId, course.id, status, progress, completedAt]
          );
        await enroll(courses.emsile, "ENROLLED", 40);
        await enroll(courses.bina, "ENROLLED", 15);
        await enroll(courses.siyer, "ENROLLED", 20);
        await enroll(courses.isagoji, "PENDING", 0);
        await enroll(courses.tecvid, "COMPLETED", 100, "2026-09-26T10:00:00Z");
        await client.query(
          "insert into kosk_followers(user_id, kosk_id) values ($1, $2)",
          [userId, kosks.nur.id]
        );
        await client.query(
          "insert into decks_users(user_id, deck_id) values ($1, $2)",
          [userId, deckId]
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    },
    remove: async () => {
      try {
        await client.query("begin");
        if (talebe) {
          await client.query(
            "delete from enrollments where user_id = $1 and course_id = any($2)",
            [talebe, courseIds]
          );
          await client.query(
            "delete from kosk_followers where user_id = $1 and kosk_id = any($2)",
            [talebe, koskIds]
          );
        }
        await client.query("delete from decks where id = $1", [deckId]);
        await client.query(
          "delete from role_assignments where scope_id = any($1)",
          [[...madrasahIds, ...courseIds]]
        );
        await client.query(
          "delete from lessons where week_id in (select id from course_weeks where course_id = any($1))",
          [courseIds]
        );
        await client.query(
          "delete from course_weeks where course_id = any($1)",
          [courseIds]
        );
        await client.query(
          "delete from course_muderris where course_id = any($1)",
          [courseIds]
        );
        await client.query("delete from courses where id = any($1)", [
          courseIds,
        ]);
        await client.query(
          "delete from kosks where id = any($1) or name like $2",
          [koskIds, `Sayfa ${pageTag} %`]
        );
        await client.query("delete from madrasahs where id = any($1)", [
          madrasahIds,
        ]);
        await client.query("delete from users where id = $1", [head]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
