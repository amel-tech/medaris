// The walk data of nazar.bans.decide and nazar.bans.courseBans: open bans on spare talebe accounts, in the seeded medrese, placed through tedrisat's HTTP API,
// and taken away again. It is the binding's `setup` and `teardown`: `node helpers/madrasah-bans.mjs <command> ...` (the working
// directory of a binding's setup is graphs/bindings/). It uses the shared helpers' library (lib.mjs, db.mjs) and no password is ever
// on a command line or printed.
//
//   up <tag> [--course KEY,KEY] [--wide KEY,KEY] [--medaris KEY,KEY]
//        <tag> is the tag of a course made by `helpers/course.mjs make <tag> --madrasah <id>` (graphs/.local/made/<tag>.json).
//        Each person is first cleared of every ban in the medrese (so a crashed walk leaves nothing to be refused), then:
//          --course   a course ban on the made course, placed by the başmüderris (tier 2): the row offers lift, widen and request
//          --wide     a medrese-wide ban, placed by the başmüderris: the row offers lift and request
//          --medaris  a course ban placed by the başnazım (SYSTEM_ADMIN, tier 4): the row offers only the widening
//        Prints `ready: <n> open`.
//   down <tag> --people KEY,KEY
//        Removes every ban of those people in the medrese (and its permanent requests): the only SQL here. No route deletes a ban
//        (a ban is lifted, never deleted) and the API has no way to take a request back, and a ban has no foreign key to the course
//        that `course.mjs remove` deletes, so it would stay. Prints `removed <n>`.
//   lift <tag> --who KEY[,KEY] [--newest]
//                              the başmüderris lifts the people's open course bans through the API: a second hand that decides
//                              first. With --newest only the newest of them, which is the first row of the list, the one a press
//                              decides (`lifted <KEY>`, or `already <KEY>` when none is open: it may run twice in one walk)
//   request <tag> --who KEY    the başmüderris asks for that person's ban to be made permanent, through the API (`requested <KEY>`,
//                              or `already <KEY>` when a request exists or no ban is open)
//   state <tag> --who KEY,KEY  prints, for each person's bans in the medrese, one line: `ban <KEY> COURSE|MADRASAH open|lifted [request]`,
//                              or `ban <KEY> none`
//   check <tag> --who KEY,KEY --has "<text>"
//                              as `state`, and fails unless one of the lines holds the text; prints `has: <text>`. For a binding's
//                              `effects`, which cannot compute: the scenario gives the people and the text
//
// KEY is the role key of an account in graphs/.local/accounts.env (APPLICANT_C, ...). The seed's own bans (it has none) are never
// read or touched: only the named people's.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "./db.mjs";
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
} from "./lib.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const usage =
  "usage: madrasah-bans.mjs up <tag> [--course KEY,..] [--wide KEY,..] [--medaris KEY,..] | down <tag> --people KEY,.. | lift <tag> --who KEY,.. [--newest] | request <tag> --who KEY | state <tag> --who KEY,.. | check <tag> --who KEY,.. --has <text>";

const keys = (list) =>
  (list ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

function madeCourse(tag) {
  const file = resolve(LOCAL, "made", `${tag}.json`);
  let made;
  try {
    made = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Fail(
      `${file} does not exist: make the course first (helpers/course.mjs make ${tag} --madrasah <id>)`
    );
  }
  if (!UUID.test(made.course ?? ""))
    throw new Fail(`${file} holds no course id`);
  return made.course;
}

const madrasah = () => {
  const id = seed().madrasah;
  if (!UUID.test(id ?? "")) throw new Fail("seed.json holds no medrese");
  return id;
};

const sub = (key) => {
  const id = subOf(key);
  if (!UUID.test(id)) throw new Fail(`${key} has no usable id`);
  return id;
};

/** Every ban of the person in the medrese: its own, those of its courses (the made one too), and those of a course that no longer exists. */
const banWhere = (who, course) =>
  `user_id = '${sub(who)}' and (madrasah_id = '${madrasah()}' or course_id in (select id from courses where madrasah_id = '${madrasah()}') or (course_id is not null and not exists (select 1 from courses where courses.id = bans.course_id))${course ? ` or course_id = '${course}'` : ""})`;

async function clear(people, course) {
  let removed = 0;
  for (const who of people) {
    await query(
      `delete from ban_permanent_requests where ban_id in (select id from bans where ${banWhere(who, course)})`
    );
    const out = await query(
      `delete from bans where ${banWhere(who, course)} returning id`
    );
    removed += out.split("\n").filter((l) => l.trim().startsWith("{")).length;
  }
  return removed;
}

/** The ids of the person's open course bans in the medrese, newest first, each with the person it is on. */
async function openBansOf(people, course) {
  const found = [];
  for (const who of people) {
    const out = await query(
      `select id, created_at from bans where ${banWhere(who, course)} and lifted_at is null and scope = 'COURSE'`
    );
    for (const line of out.split("\n").map((l) => l.trim()))
      if (line.startsWith("{")) found.push({ who, ...JSON.parse(line) });
  }
  return found.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

const reason = (kind) =>
  ({
    course: "Celselerde ders dışı reklam yaptı",
    wide: "Birden çok derste aynı davranışı sürdürdü",
    medaris: "Hesabını başka birine kullandırdı",
  })[kind];

run("bans", async () => {
  const [command, tag, ...rest] = process.argv.slice(2);
  if (!command || !tag) throw new Fail(usage, 2);
  const o = options(rest, {
    values: ["course", "wide", "medaris", "people", "who", "has"],
    flags: ["newest"],
  });
  if (o.rest.length) throw new Fail(usage, 2);

  if (command === "up") {
    const course = madeCourse(tag);
    const own = keys(o.course);
    const wide = keys(o.wide);
    const platform = keys(o.medaris);
    const everyone = [...own, ...wide, ...platform];
    if (!everyone.length) throw new Fail(usage, 2);
    await clear(everyone, course);
    for (const who of everyone) await nameOf(who); // makes the person's users row, so the list can name them
    const place = (placer, body) =>
      must(placer, "POST", `/madrasahs/${madrasah()}/bans`, body);
    for (const who of own)
      await place("basmuderris", {
        userId: sub(who),
        scope: "COURSE",
        courseId: course,
        reason: reason("course"),
      });
    for (const who of wide)
      await place("basmuderris", {
        userId: sub(who),
        scope: "MADRASAH",
        reason: reason("wide"),
      });
    for (const who of platform)
      await place("SYSTEM_ADMIN", {
        userId: sub(who),
        scope: "COURSE",
        courseId: course,
        reason: reason("medaris"),
      });
    console.log(`ready: ${everyone.length} open`);
    return;
  }

  if (command === "down") {
    const people = keys(o.people);
    if (!people.length) throw new Fail(usage, 2);
    let course;
    try {
      course = madeCourse(tag); // gone already when the course was removed first: its bans are found by the people
    } catch {
      course = undefined;
    }
    console.log(`removed ${await clear(people, course)}`);
    return;
  }

  if (command === "lift" || command === "request") {
    const who = keys(o.who);
    if (!who.length) throw new Fail(usage, 2);
    let open = await openBansOf(who, madeCourse(tag));
    if (o.newest || command === "request") open = open.slice(0, 1);
    if (!open.length) {
      console.log(`already ${who.map(accountKey).join(",")}`);
      return;
    }
    for (const ban of open) {
      if (command === "lift") {
        await must("basmuderris", "POST", `/bans/${ban.id}/lift`, {
          reason: "Başka bir hoca önce kaldırdı",
        });
        console.log(`lifted ${accountKey(ban.who)}`);
      } else {
        const r = await must(
          "basmuderris",
          "POST",
          `/bans/${ban.id}/permanent-request`,
          { reason: "Başka bir hoca önce istedi" },
          [409]
        );
        console.log(
          `${r.status === 409 ? "already" : "requested"} ${accountKey(ban.who)}`
        );
      }
    }
    return;
  }

  if (command === "state" || command === "check") {
    const who = keys(o.who);
    if (!who.length) throw new Fail(usage, 2);
    let course;
    try {
      course = madeCourse(tag);
    } catch {
      course = undefined;
    }
    const lines = [];
    for (const key of who) {
      const out = await query(
        `select scope, (lifted_at is not null) as lifted, exists (select 1 from ban_permanent_requests r where r.ban_id = bans.id) as asked from bans where ${banWhere(key, course)} order by created_at`
      );
      const rows = out
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("{"))
        .map((l) => JSON.parse(l));
      if (!rows.length) lines.push(`ban ${accountKey(key)} none`);
      for (const r of rows)
        lines.push(
          `ban ${accountKey(key)} ${r.scope} ${r.lifted ? "lifted" : "open"}${r.asked ? " request" : ""}`
        );
    }
    if (command === "state") {
      for (const l of lines) console.log(l);
      return;
    }
    if (!o.has) throw new Fail(usage, 2);
    if (!lines.some((l) => l.includes(o.has)))
      throw new Fail(`no ban line holds "${o.has}": ${lines.join(" | ")}`);
    console.log(`has: ${o.has}`);
    return;
  }

  throw new Fail(usage, 2);
});
