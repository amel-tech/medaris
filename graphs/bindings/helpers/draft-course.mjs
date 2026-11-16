// Makes the one thing tedris.shell.systemPages needs that the seed has not got: a DRAFT course whose page throws when it is drawn,
// and takes it away again (the flow's setup, its event and its teardown).
//
//   node helpers/draft-course.mjs make     a draft köşk course, one scheduled celse, the müderris account as its hoca
//   node helpers/draft-course.mjs break    its time zone becomes "Nope/Zone", which the preview card cannot format
//   node helpers/draft-course.mjs fix      its time zone is Europe/Istanbul again
//   node helpers/draft-course.mjs remove   the course and everything under it is deleted
//
// Why a draft with a bad zone: a draft is shown to those who may edit it as a preview (apps/tedris/features/courses/components/
// course-page.tsx:147-170), and the preview card writes the first celse's time with Intl.DateTimeFormat in the course's zone
// (features/courses/preview.ts:31). A zone the platform cannot format makes the server render throw a RangeError, which is the one
// way to meet app/error.tsx without breaking tedrisat itself (the same trick as apps/tedris/e2e/system-pages.e2e.ts#10). The API
// takes only a real zone when a course is made ("an IANA zone, canonicalised"), so `break` is SQL on tedrisat's own database
// (courses.time_zone): there is no route that stores a bad one.
//
// What it uses: the köşk nazım makes the course (POST /kosks/{koskId}/courses, as `koskNazim`), naming the müderris account as the
// hoca (the nazım may not name themselves); the başnazım deletes it (DELETE /courses/{id} is SYSTEM_ADMIN's alone). The course's id is
// written to graphs/.local/system-pages.json ({"draft": "<uuid>"}), which the binding reads as {sp.draft}. `make` and `remove` are
// idempotent: `make` first deletes any course of that title in the köşk, `remove` says `none` when there is none.
// Prints `draft-course <mode> <what was done>`. Nothing secret is printed.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "./db.mjs";
import { Fail, LOCAL, must, nameOf, run, seed, subOf } from "./lib.mjs";

const TITLE = "Sistem sayfaları denemesi";
const FILE = resolve(LOCAL, "system-pages.json");

const idsOf = async () => {
  const out = await query(
    `select id from courses where title = '${TITLE}' and kosk_id = '${seed().kosk}'`
  );
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l).id);
};

const remove = async (ids) => {
  for (const id of ids)
    await must("systemAdmin", "DELETE", `/courses/${id}`, undefined, [404]);
};

const note = (id) => {
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(FILE, `${JSON.stringify({ draft: id })}\n`, { mode: 0o600 });
};

run("draft-course", async () => {
  const [mode, ...more] = process.argv.slice(2);
  if (!["make", "break", "fix", "remove"].includes(mode) || more.length)
    throw new Fail("usage: draft-course.mjs make|break|fix|remove", 2);

  if (mode === "make") {
    const old = await idsOf();
    await remove(old);
    const r = await must("koskNazim", "POST", `/kosks/${seed().kosk}/courses`, {
      title: TITLE,
      muderris: [{ userId: subOf("muderris"), name: await nameOf("muderris") }],
      status: "DRAFT",
      weeks: [
        {
          weekNumber: 1,
          title: "Birinci hafta",
          lessons: [
            {
              title: "Tanışma celsesi",
              type: "LIVE",
              scheduledAt: "2026-12-07T18:00:00Z",
            },
          ],
        },
      ],
    });
    note(r.body.id);
    console.log(
      `draft-course make ${r.body.id} ${r.body.status}${old.length ? ` (removed ${old.length} old)` : ""}`
    );
    return;
  }

  const ids = await idsOf();
  if (mode === "remove") {
    await remove(ids);
    console.log(`draft-course remove ${ids.length ? ids.length : "none"}`);
    return;
  }
  if (ids.length !== 1)
    throw new Fail(`${mode}: expected one draft course, found ${ids.length}`);
  const zone = mode === "break" ? "Nope/Zone" : "Europe/Istanbul";
  const done = await query(
    `update courses set time_zone = '${zone}' where id = '${ids[0]}'`
  );
  console.log(`draft-course ${mode} ${ids[0]} ${done.trim()}`);
});
