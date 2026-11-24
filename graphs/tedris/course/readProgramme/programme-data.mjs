// Makes what tedris.course.readProgramme needs and the seed has not got, and takes it away again (the flow's setup and teardown):
// a published course of its own in the second köşk, with a programme that has everything the page marks, and the walk's talebe
// holding one seat in it.
//
//   node ../tedris/course/readProgramme/programme-data.mjs make                  the course, with its weeks, celses, marks and resource
//   node ../tedris/course/readProgramme/programme-data.mjs seat <STATUS>         applicantA's row: ENROLLED, COMPLETED, PENDING, REVOKED or none
//   node ../tedris/course/readProgramme/programme-data.mjs passive on|off        the course's only hoca is taken out, or put back (a passive scope)
//   node ../tedris/course/readProgramme/programme-data.mjs remove                the course and everything under it is deleted
//
// Why a course of its own. The seeded courses are other flows' data and change under a walk (a writer's walk took the resource off
// the open one while this was being written). A cancelled celse, an exam, and homework of both kinds, a sample celse, weeks that
// have not begun and a link in the resources are what the Müfredat tab draws, and the seed has few of them. The course lives in
// the second köşk, "Kubbealtı Köşkü", which no other flow uses, and its title is the only thing `make` and `remove` look it up by.
//
// What it uses: the köşk's nazım makes the course (POST /kosks/{id}/courses), naming the `muderris` account as the hoca (the nazım
// may not name themselves); the hoca cancels a celse, sets the homework and plans the exam (POST /lessons/{id}/cancel,
// PUT /lessons/{id}/assignment, POST /courses/{id}/sessions/batch with an exam); the başnazım deletes the course. `seat` takes
// the seat the way a person does (POST /courses/{id}/enroll, the course takes anyone) and then, for COMPLETED, PENDING and
// REVOKED, writes the status with SQL on tedrisat's database, as the app's own e2e does (apps/tedris/e2e/course-page-seed.ts): the
// routes that make those take a second person's decision and, for REVOKED and COMPLETED, a reason or a mark the page does not read.
// The course's ids are in graphs/.local/read-programme.json, read by the binding as {prog.course}, {prog.next} and so on.
// `make` and `remove` are idempotent. Prints `programme-data <mode> <what was done>`. Nothing secret is printed.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  accountKey,
  env,
  Fail,
  LOCAL,
  MAILPIT,
  must,
  nameOf,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const TITLE = "Okuma düzeni denemesi";
const FILE = resolve(LOCAL, "read-programme.json");
const TALEBE = "applicantA";
const DAY = 86_400_000;

// An instant `days` from now at 18:00 UTC (21:00 in Istanbul), the hour the seed's own celses have.
const at = (days) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(18, 0, 0, 0);
  return d.toISOString();
};
// The same day as `YYYY-MM-DD` for the batch route, which takes a date and a clock in the course's zone.
const dateOf = (days) => at(days).slice(0, 10);

const idsOf = async () => {
  const out = await query(
    `select id from courses where title = '${TITLE}' and kosk_id = '${seed().kosk2}'`
  );
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l).id);
};

// Deleting a course that has a seat makes tedrisat's invitation sweep mail the talebe a cancellation for each celse, a moment after the
// delete answers, so the mails that name this course are deleted after a pause. Only those: the spare account may hold mail another
// flow's walk left or waits for.
const clearMail = async () => {
  await new Promise((done) => setTimeout(done, 6000));
  const query = `to:${env().E2E_APPLICANT_A_EMAIL} subject:"${TITLE}"`;
  await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(query)}`, {
    method: "DELETE",
    signal: AbortSignal.timeout(30_000),
  });
};

const remove = async () => {
  const ids = await idsOf();
  for (const id of ids)
    await must("systemAdmin", "DELETE", `/courses/${id}`, undefined, [404]);
  if (ids.length) await clearMail();
  return ids.length;
};

const make = async () => {
  await remove();
  const week = (n, title, summary, lessons) => ({
    weekNumber: n,
    title,
    ...(summary ? { summary } : {}),
    lessons,
  });
  const lesson = (title, days, extra = {}) => ({
    title,
    type: "LIVE",
    durationMinutes: 60,
    scheduledAt: at(days),
    ...extra,
  });
  const created = (
    await must("koskNazim", "POST", `/kosks/${seed().kosk2}/courses`, {
      title: TITLE,
      description: "Okuma düzenini görmek için yazılmış deneme dersi.",
      status: "PUBLISHED",
      requiresApproval: false,
      muderris: [{ userId: subOf("muderris"), name: await nameOf("muderris") }],
      resources: [
        {
          name: "Okuma listesi",
          meta: "Bağlantı",
          url: "https://example.com/okuma-listesi",
        },
      ],
      weeks: [
        week(1, "Giriş", "Konunun genel çerçevesi.", [
          lesson("Tanışma", -14, {
            isPreview: true,
            kaynak: "Birinci fasıl",
            agenda: [
              { time: "21:00", title: "Tanışma" },
              { time: "21:30", title: "Birinci fasıl" },
            ],
          }),
          lesson("Birinci okuma", -12),
        ]),
        week(2, "Okuma", undefined, [
          lesson("İkinci okuma", 2, { kaynak: "İkinci fasıl" }),
          lesson("Ezber celsesi", 4),
          lesson("Telafi okuma", 5),
        ]),
        week(3, "Derinleşme", undefined, [lesson("Üçüncü okuma", 9)]),
        week(4, "Tekrar", undefined, [lesson("Tekrar celsesi", 16)]),
      ],
    })
  ).body;
  const course = (await must("koskNazim", "GET", `/courses/${created.id}`))
    .body;
  const byTitle = (t) =>
    course.weeks.flatMap((w) => w.lessons).find((l) => l.title === t);
  const cancelled = byTitle("Telafi okuma");
  const homework = byTitle("İkinci okuma");
  const memorize = byTitle("Ezber celsesi");
  const next = homework;

  await must("muderris", "POST", `/lessons/${cancelled.id}/cancel`, {
    version: course.version,
    reason: "Hoca yolda.",
  });
  await must("muderris", "PUT", `/lessons/${homework.id}/assignment`, {
    description: "İkinci fasılı oku ve özetini yaz.",
    kind: "FILE",
  });
  await must("muderris", "PUT", `/lessons/${memorize.id}/assignment`, {
    description: "Birinci fasılı ezbere oku.",
    kind: "MEMORIZE",
  });
  // The exam is one session the batch route plans in the week the date falls in, or in a week it adds after the last.
  const exam = (
    await must("muderris", "POST", `/courses/${created.id}/sessions/batch`, {
      weekdays: [new Date(Date.now() + 3 * DAY).getUTCDay() || 7],
      startTime: "21:00",
      timeZone: "Europe/Istanbul",
      startDate: dateOf(3),
      count: 1,
      title: "Ara sınav",
      durationMinutes: 60,
      exam: {},
    })
  ).body;

  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(
    FILE,
    `${JSON.stringify({
      course: created.id,
      next: next.id,
      cancelled: cancelled.id,
      sample: byTitle("Tanışma").id,
      exam: exam.lessons?.[0]?.id ?? null,
      title: TITLE,
    })}\n`,
    { mode: 0o600 }
  );
  return created.id;
};

const seat = async (status) => {
  const [id] = await idsOf();
  if (!id) throw new Fail("no course: run make first");
  const key = accountKey(TALEBE);
  await query(
    `delete from enrollments where course_id = '${id}' and user_id = '${subOf(TALEBE)}'`
  );
  if (status === "none") return `${key} has no seat`;
  await must(TALEBE, "POST", `/courses/${id}/enroll`);
  if (status !== "ENROLLED") {
    // COMPLETED needs completed_at, as the course team's "tamamlandı" writes it.
    await query(
      `update enrollments set status = '${status}'${status === "COMPLETED" ? ", completed_at = now()" : ""} where course_id = '${id}' and user_id = '${subOf(TALEBE)}'`
    );
  }
  return `${key} ${status}`;
};

// A scope is passive when its müderris role was held once and nobody holds it now (MDRS-136): the role rows are revoked, and an
// enrolled talebe of such a course is shut out of its content by the engine (the page then draws `contentLocked` for a seat).
const passive = async (on) => {
  const [id] = await idsOf();
  if (!id) throw new Fail("no course: run make first");
  await query(
    on
      ? `update role_assignments set revoked_at = now(), revoked_by = granted_by where role = 'MUDERRIS' and scope_id = '${id}'`
      : `update role_assignments set revoked_at = null, revoked_by = null where role = 'MUDERRIS' and scope_id = '${id}'`
  );
  return on ? "passive" : "active";
};

run("programme-data", async () => {
  const [mode, arg, ...more] = process.argv.slice(2);
  const modes = ["make", "seat", "passive", "remove"];
  if (
    !modes.includes(mode) ||
    more.length ||
    (mode === "seat" || mode === "passive") !== !!arg
  )
    throw new Fail(
      "usage: programme-data.mjs make | seat <ENROLLED|COMPLETED|PENDING|REVOKED|none> | passive on|off | remove",
      2
    );
  if (mode === "passive" && !["on", "off"].includes(arg))
    throw new Fail(`passive takes on or off, not ${arg}`, 2);
  if (
    mode === "seat" &&
    !["ENROLLED", "COMPLETED", "PENDING", "REVOKED", "none"].includes(arg)
  )
    throw new Fail(`unknown status ${arg}`, 2);
  const done =
    mode === "make"
      ? `course ${await make()}`
      : mode === "seat"
        ? await seat(arg)
        : mode === "passive"
          ? await passive(arg === "on")
          : `${await remove()} course(s) removed`;
  console.log(`programme-data ${mode} ${done}`);
});
