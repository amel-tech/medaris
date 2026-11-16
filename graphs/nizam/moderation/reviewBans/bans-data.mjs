// The walk data of nizam.moderation.reviewBans: bans on spare talebe of a course the walk made, placed through tedrisat's HTTP API by the people who would
// place them, a Medaris nazımı for the reader scenarios, a long list for "Daha fazla göster", and the one check of what the page's two numbers must equal.
// It is the binding's `setup`, `teardown` and `effects`: `node ../nizam/moderation/reviewBans/bans-data.mjs <command> ...` (a binding's working
// directory is graphs/bindings/). It uses the shared helpers' library (lib.mjs, db.mjs); no password is ever on a command line or printed.
//
//   up <tag> [--no-kosk]
//        <tag> is the tag of a course made by `helpers/course.mjs make <tag> --kosk <id> --talebe applicantC,applicantD` (graphs/.local/made/<tag>.json).
//        It first removes what an earlier run of the same tag left, then places, through the API, as the right person each time:
//          applicantC (Esma Başvuran)  a course ban by the course's müderris, lifted by the köşk's nazım ("Süre doldu; söz verdi.");
//                                      a köşk ban by the köşk's nazım, lifted by the köşk's nazım; then both again and left standing
//          applicantD (Salih Başvuran) a course ban by the başnazım (SYSTEM_ADMIN: the row says "Medaris yönetimi", and "(siz)" to the başnazım)
//        so the Etkin tab holds three rows (Ders by Hoca, Köşk by Köşk nazımı, Ders by Medaris yönetimi) and the Kaldırılan tab two, and both kinds are in both
//        tabs. `--no-kosk` leaves out every köşk ban: two open rows and one lifted, all of the Ders kind.
//        Prints `ready: <open> open, <lifted> lifted` (the rows of this tag, read back as the başnazım through GET /bans).
//   down <tag>
//        Removes every row `up` made, and nothing else: the bans on the tag's courses (by the course ids it kept in graphs/.local/made/reviewbans-state.json, the
//        made file's and any course still titled "Deneme dersi <tag>"), their permanent requests, and the notices tedrisat wrote to the köşk's nazım and the Medaris
//        nazımları for them (COURSE_BAN_PLACED, KOSK_BAN_PLACED, found by the course's title). Run it BEFORE `course.mjs remove <tag>`: a barred talebe cannot leave a
//        course, and a ban has no foreign key to the course. Safe to run twice. Prints `down <tag>`.
//   paged up <tag> [--count 23]     a long list, by SQL: <count> invented people "Sayfalı Yasaklı 01".., each with an open course ban on the tag's course placed
//   paged down                      by the köşk's nazım, 1..<count> minutes old, so that the Etkin list holds more than a page (e2e bans-medaris#4). `down` removes them
//                                   and their bans. No route makes a user row for a person who never signed in, and the bulk is a statement of its own.
//   medaris up <ACCOUNT> --codes <code,code>   appoints a spare account as a Medaris nazımı holding exactly these platform permissions (POST /nizam/medaris-nazims, or
//                                   PUT .../grants when it holds the seat already), as the başnazım
//   medaris down <ACCOUNT>          dismisses it again (DELETE /nizam/medaris-nazims/<id>); `dismissed=none` when it is not one. The seed's own MEDARIS_NAZIM is refused.
//   counts                          reads GET /bans as the başnazım for each tab with no filter, fails unless the list's own `total` equals the tab's count (e2e
//                                   bans-medaris#2) and writes graphs/.local/made/reviewbans-counts.json {activeText, liftedText, ...}, which the binding reads as {counts.*}.
//                                   Prints `counts agree`.
//
// What it cannot undo, and why: the audit rows (`ban.create`, `ban.lift`) every route writes, which no route removes; and nothing else, because the notices are
// deleted here and the talebe's own notice ("erişimin kaldırıldı", which points at the course) goes with `course.mjs remove`. Every ban on a person of this
// flow is removed by SQL, the one SQL write of the ban rows: no route deletes a ban, a ban is lifted and stays on record. The people are spare talebe
// (applicantC, applicantD), never a seeded person; the paged people have no Keycloak account and a fixed id prefix, so `down` finds them again after a crash.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  accountKey,
  Fail,
  LOCAL,
  must,
  nameOf,
  options,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const usage =
  "usage: bans-data.mjs up <tag> [--no-kosk] | down <tag> | paged up <tag> [--count n] | paged down | medaris up <ACCOUNT> --codes <code,..> | medaris down <ACCOUNT> | counts";

const MADE = resolve(LOCAL, "made");
const STATE = resolve(MADE, "reviewbans-state.json");
const COUNTS = resolve(MADE, "reviewbans-counts.json");
const PAGED_PREFIX = "c0a40000-0000-4000-8000-";

const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const uuid = (s, what) => {
  if (!UUID.test(String(s ?? "")))
    throw new Fail(`${what} is not a uuid: ${s}`);
  return String(s);
};
const rowsOf = (out) =>
  out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l));

/** The course `course.mjs make <tag>` recorded. */
function madeCourse(tag) {
  const file = resolve(MADE, `${tag}.json`);
  let made;
  try {
    made = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Fail(
      `${file} does not exist: make the course first (helpers/course.mjs make ${tag} --kosk <id> --talebe applicantC,applicantD)`
    );
  }
  return {
    course: uuid(made.course, "the made course"),
    title: made.title ?? `Deneme dersi ${tag}`,
    kosk: uuid(made.kosk ?? seed().kosk, "the made course's köşk"),
  };
}

const readState = () => {
  try {
    return JSON.parse(readFileSync(STATE, "utf8"));
  } catch {
    return { courses: [] };
  }
};
const writeState = (state) => {
  mkdirSync(MADE, { recursive: true });
  writeFileSync(STATE, JSON.stringify(state));
};

/** Every row an earlier or this run of `up <tag>` made. Idempotent. */
async function clean(tag) {
  const title = `Deneme dersi ${tag}`;
  const ids = new Set(readState().courses);
  try {
    ids.add(madeCourse(tag).course);
  } catch {
    // no made file: the state file and the title find the rest
  }
  for (const r of rowsOf(
    await query(`select id from courses where title = ${q(title)}`)
  ))
    ids.add(uuid(r.id, "a course id"));
  const list = [...ids].map((i) => q(uuid(i, "a course id"))).join(", ");
  const statements = [];
  if (ids.size) {
    statements.push(
      `delete from ban_permanent_requests where ban_id in (select id from bans where course_id in (${list}) or extended_from_course_id in (${list}))`,
      `delete from bans where course_id in (${list}) or extended_from_course_id in (${list})`
    );
  }
  statements.push(
    `delete from notifications where type in ('COURSE_BAN_PLACED', 'KOSK_BAN_PLACED') and params->>'courseTitle' = ${q(title)}`
  );
  await query(statements.join(";\n"));
  writeState({ courses: [] });
}

const PERSON = { esma: "APPLICANT_C", salih: "APPLICANT_D" };

async function up(tag, { noKosk }) {
  const made = madeCourse(tag);
  await clean(tag);
  writeState({ courses: [made.course] }); // kept at once: a failure below is still removable
  for (const key of Object.values(PERSON)) await nameOf(key); // GET /me makes the person's users row, so the list can name them
  const place = async (as, who, scope, reason) =>
    (
      await must(as, "POST", `/courses/${made.course}/bans`, {
        userId: subOf(who),
        scope,
        reason,
      })
    ).body.id;
  const lift = (as, id, reason) =>
    must(as, "POST", `/bans/${id}/lift`, { reason });

  const esma = PERSON.esma;
  const first = await place(
    "MUDERRIS",
    esma,
    "COURSE",
    "Celselerde ders dışı reklam yaptı."
  );
  await lift("KOSK_NAZIM", first, "Süre doldu; söz verdi.");
  if (!noKosk) {
    const wide = await place(
      "KOSK_NAZIM",
      esma,
      "KOSK",
      "Başka derslerde de aynı davranışı sürdürdü."
    );
    await lift("KOSK_NAZIM", wide, "Yeniden başvurdu; söz verdi.");
  }
  await place("MUDERRIS", esma, "COURSE", "Ders dışı bağlantılar paylaştı.");
  if (!noKosk)
    await place(
      "KOSK_NAZIM",
      esma,
      "KOSK",
      "Köşkün başka derslerinde de aynı davranışı sürdürdü."
    );
  await place(
    "SYSTEM_ADMIN",
    PERSON.salih,
    "COURSE",
    "Hesabını başka birine kullandırdı."
  );

  // what the page will read, as the başnazım: the rows of this course, by scope and state
  let open = 0;
  let lifted = 0;
  for (const status of ["ACTIVE", "LIFTED"]) {
    const list = (
      await must(
        "SYSTEM_ADMIN",
        "GET",
        `/bans?status=${status}&q=${encodeURIComponent("Başvuran")}&limit=100`
      )
    ).body;
    const mine = (list.items ?? []).filter(
      (b) =>
        b.courseId === made.course || b.extendedFromCourseId === made.course
    );
    if (status === "ACTIVE") open = mine.length;
    else lifted = mine.length;
  }
  console.log(`ready: ${open} open, ${lifted} lifted`);
}

async function paged(command, tag, count) {
  if (command === "down") {
    await query(
      [
        `delete from ban_permanent_requests where ban_id in (select id from bans where user_id::text like '${PAGED_PREFIX}%')`,
        `delete from bans where user_id::text like '${PAGED_PREFIX}%'`,
        `delete from users where id::text like '${PAGED_PREFIX}%'`,
      ].join(";\n")
    );
    console.log("paged down");
    return;
  }
  if (!tag) throw new Fail(usage, 2);
  const made = madeCourse(tag);
  const n = Number(count ?? 23);
  if (!Number.isInteger(n) || n < 21 || n > 99)
    throw new Fail("--count is a whole number from 21 to 99", 2);
  const nazim = uuid(subOf("KOSK_NAZIM"), "the köşk nazım's id");
  const id = `('${PAGED_PREFIX}' || lpad(n::text, 12, '0'))::uuid`;
  await query(
    [
      `delete from ban_permanent_requests where ban_id in (select id from bans where user_id::text like '${PAGED_PREFIX}%')`,
      `delete from bans where user_id::text like '${PAGED_PREFIX}%'`,
      `delete from users where id::text like '${PAGED_PREFIX}%'`,
      `insert into users (id, email, given_name, family_name) select ${id}, 'sayfali' || n || '@example.test', 'Sayfalı', 'Yasaklı ' || lpad(n::text, 2, '0') from generate_series(1, ${n}) n`,
      `insert into bans (user_id, kosk_id, course_id, scope, reason, banned_by, banned_role, banned_tier, created_at) select ${id}, '${made.kosk}', '${made.course}', 'COURSE', 'Sayfalama için konan yasak.', '${nazim}', 'KOSK_NAZIM', 3, now() - (n || ' minutes')::interval from generate_series(1, ${n}) n`,
    ].join(";\n")
  );
  const state = readState();
  if (!state.courses.includes(made.course)) {
    state.courses.push(made.course); // `down <tag>` finds these bans through the course too
    writeState(state);
  }
  console.log(`ready: ${n} paged`);
}

const CHIEF = "SYSTEM_ADMIN";
const medarisRows = async () =>
  (await must(CHIEF, "GET", "/nizam/medaris-nazims")).body;
const codesOf = (row) => (row?.permissions ?? []).map((p) => p.code);

async function medaris(command, account, codes) {
  if (!account) throw new Fail(usage, 2);
  if (accountKey(account) === "MEDARIS_NAZIM")
    throw new Fail(
      "the seed's own Medaris nazımı is never changed by a walk",
      2
    );
  const sub = subOf(account);
  const row = (await medarisRows()).find((r) => r.user?.id === sub);
  if (command === "up") {
    if (!codes) throw new Fail("medaris up needs --codes <code,code>", 2);
    const wanted = codes.split(",").map((c) => c.trim());
    await must(account, "GET", "/me"); // tedrisat makes the person's row at their first call; the appointment names it
    if (row)
      await must(CHIEF, "PUT", `/nizam/medaris-nazims/${sub}/grants`, {
        permissions: wanted,
      });
    else
      await must(CHIEF, "POST", "/nizam/medaris-nazims", {
        userId: sub,
        permissions: wanted,
      });
    const now = codesOf((await medarisRows()).find((r) => r.user?.id === sub));
    const same =
      now.length === wanted.length && wanted.every((c) => now.includes(c));
    if (!same)
      throw new Fail(
        `medaris up ${accountKey(account)}: holds ${now.join(",") || "none"}, wanted ${wanted.join(",")}`
      );
    console.log(`medaris up ${accountKey(account)} codes=${now.join(",")}`);
    return;
  }
  if (command === "down") {
    if (!row) {
      console.log(`medaris down ${accountKey(account)} dismissed=none`);
      return;
    }
    // what the person handed on to someone else must be answered; this nazım hands nothing on
    const given =
      (await must(CHIEF, "GET", `/nizam/medaris-nazims/${sub}/given`)).body ??
      [];
    const decisions = given
      .filter(
        (g) =>
          (g.kind === "ROLE" || g.kind === "GRANT") && g.to && g.to.id !== sub
      )
      .map((g) => ({ kind: g.kind, id: g.id, action: "DROP" }));
    await must(CHIEF, "DELETE", `/nizam/medaris-nazims/${sub}`, { decisions });
    console.log(`medaris down ${accountKey(account)} dismissed=1`);
    return;
  }
  throw new Fail(usage, 2);
}

async function counts() {
  const read = async (status) =>
    (await must(CHIEF, "GET", `/bans?status=${status}&limit=1`)).body;
  const active = await read("ACTIVE");
  const lifted = await read("LIFTED");
  if (active.total !== active.activeCount)
    throw new Fail(
      `the Etkin tab says ${active.activeCount} and the unfiltered list holds ${active.total}`
    );
  if (lifted.total !== lifted.liftedCount)
    throw new Fail(
      `the Kaldırılan tab says ${lifted.liftedCount} and the unfiltered list holds ${lifted.total}`
    );
  const format = (n) => new Intl.NumberFormat("tr").format(n); // Intl.NumberFormat of the page's locale (tabs.tsx:31)
  mkdirSync(MADE, { recursive: true });
  writeFileSync(
    COUNTS,
    JSON.stringify({
      active: active.activeCount,
      lifted: lifted.liftedCount,
      recent: active.recentCount,
      activeText: format(active.activeCount),
      liftedText: format(lifted.liftedCount),
    })
  );
  console.log("counts agree");
}

run("reviewbans-data", async () => {
  const {
    rest,
    "no-kosk": noKosk,
    count,
    codes,
  } = options(process.argv.slice(2), {
    values: ["count", "codes"],
    flags: ["no-kosk"],
  });
  const [command, ...more] = rest;
  if (command === "up" && more.length === 1) return up(more[0], { noKosk });
  if (command === "down" && more.length === 1) {
    await clean(more[0]);
    console.log(`down ${more[0]}`);
    return undefined;
  }
  if (command === "paged" && more[0] === "up" && more.length === 2)
    return paged("up", more[1], count);
  if (command === "paged" && more[0] === "down" && more.length === 1)
    return paged("down");
  if (command === "medaris" && more.length === 2)
    return medaris(more[0], more[1], codes);
  if (command === "counts" && more.length === 0) return counts();
  throw new Fail(usage, 2);
});
