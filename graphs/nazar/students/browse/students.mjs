// The walk data of nazar.students.browse, made and removed through tedrisat's HTTP API and, where no route can make a talebe,
// SQL on tedrisat's database (the stack's Postgres container, the way the e2e's own seed does: apps/nazar/e2e/people-seed.ts). It is
// the binding's `setup` and `teardown`: `node ../nazar/students/browse/students.mjs <verb> ...` from graphs/bindings/.
//
//   rows <tagA> <tagB>           26 talebe in the two courses `helpers/course.mjs make <tag> --madrasah {seed.madrasah}` made. The first
//                                (the newest) attends A and has finished B; seven more attend A; eighteen more attend B. Their names are
//                                "Deneme Talebe 01 browse" to "Deneme Talebe 26 browse", their e-mails "talebe.NN.browse@example.test", their
//                                ids 0b5e0001-0000-4000-8000-0000000000NN (no account stands behind them: an enrolment keeps its own
//                                name and e-mail, as the e2e's does). It checks that the medrese then holds 21 to 30 talebe, which is
//                                three pages of ten (the graph's `many`), and writes graphs/.local/made/browse.json
//                                {total, pages, last, a, b}, which the binding reads as `{browse.total}` and `{browse.last}`.
//   rows-remove                  takes those enrolments away (every row whose user id starts 0b5e0001-), and the data file. Safe to run
//                                twice. Run it before `course.mjs remove`: an enrolment is a restricting foreign key of its course.
//   total --between <lo> <hi> [--madrasah <id>]
//                                counts the talebe of the medrese (the seed's, or --madrasah) the way the page does (an ENROLLED or COMPLETED
//                                seat in a course that is not hidden) and fails outside lo..hi; prints `total: N, pages: P`.
//   medrese up <tag>             a medrese of its own with nobody in it ("Boş Medrese Denemesi", handle bos-medrese-denemesi), opened by the
//                                başnazım with the stack's başmüderris as its head, so that she reads an empty Talebeler. Prints its id and
//                                writes graphs/.local/made/<tag>.json {tag, madrasah}. A leftover of the same handle goes first.
//   medrese down <tag>           deletes it (the başnazım may; its role assignment goes with it). `none` when there is nothing.
//
// The seed's own talebe (TALEBE, TALEBE_MALE) are never touched. Run it under the replay lock when walks are running and you run it
// by hand. Only the API and, for the enrolments, SQL are used; nothing secret is printed.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  Fail,
  LOCAL,
  must,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const MADE = resolve(LOCAL, "made");
const PREFIX = "0b5e0001-"; // the fake user ids of this walk: no real account has one
const HANDLE = "bos-medrese-denemesi";
const usage =
  "usage: students.mjs rows <tagA> <tagB> | rows-remove | total --between <lo> <hi> [--madrasah <id>] | medrese up|down <tag>";

const fileOf = (tag) => resolve(MADE, `${tag}.json`);
const uuidOf = (n) => `${PREFIX}0000-4000-8000-${String(n).padStart(12, "0")}`;

function made(tag) {
  const file = fileOf(tag);
  if (!existsSync(file))
    throw new Fail(
      `${file} does not exist: run helpers/course.mjs make ${tag} --madrasah {seed.madrasah} first`
    );
  return JSON.parse(readFileSync(file, "utf8"));
}

function keep(tag, data) {
  mkdirSync(MADE, { recursive: true, mode: 0o700 });
  writeFileSync(fileOf(tag), `${JSON.stringify(data)}\n`, { mode: 0o600 });
}

/** The talebe of a medrese the way the page counts them: a seat that is enrolled or completed, in a course that is not hidden. */
async function totalOf(madrasah) {
  const out = await query(
    `select count(distinct e.user_id) as n from enrollments e join courses c on c.id = e.course_id where c.madrasah_id = '${madrasah}' and c.archived_at is null and e.status in ('ENROLLED', 'COMPLETED')`
  );
  const n = JSON.parse(out.trim().split("\n")[0] ?? "{}").n;
  if (!Number.isInteger(n))
    throw new Fail(`the count of talebe did not come back: ${out.trim()}`);
  return n;
}

const pagesOf = (total) => Math.ceil(total / 10);

async function rows(tagA, tagB) {
  const a = made(tagA);
  const b = made(tagB);
  const madrasah = seed().madrasah;
  for (const m of [a, b])
    if (m.madrasah !== madrasah)
      throw new Fail(
        `${m.tag} is not a course of the seed's medrese: make it with --madrasah {seed.madrasah}`
      );
  // 26 talebe, newest first: 1 attends A and has finished B, 2..8 attend A, 9..26 attend B. One second apart, all of them newer than
  // any seeded seat, so that the list starts with them.
  const cols =
    "user_id, course_id, student_name, student_email, status, created_at";
  const sql = [
    `delete from enrollments where user_id::text like '${PREFIX}%'`,
    `insert into enrollments (${cols}) select ('${PREFIX}0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, '${a.course}'::uuid, 'Deneme Talebe ' || lpad(i::text, 2, '0') || ' browse', 'talebe.' || lpad(i::text, 2, '0') || '.browse@example.test', 'ENROLLED'::enrollment_status, now() - (i * interval '1 second') from generate_series(1, 8) i`,
    `insert into enrollments (${cols}) select ('${PREFIX}0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, '${b.course}'::uuid, 'Deneme Talebe ' || lpad(i::text, 2, '0') || ' browse', 'talebe.' || lpad(i::text, 2, '0') || '.browse@example.test', 'ENROLLED'::enrollment_status, now() - (i * interval '1 second') from generate_series(9, 26) i`,
    // the newest has finished the second course (marked just now, a second after they took the seat)
    `insert into enrollments (${cols}, completed_at) values ('${uuidOf(1)}'::uuid, '${b.course}'::uuid, 'Deneme Talebe 01 browse', 'talebe.01.browse@example.test', 'COMPLETED'::enrollment_status, now() - interval '1 second', now())`,
  ].join(";\n");
  await query(sql);
  const total = await totalOf(madrasah);
  if (total < 21 || total > 30)
    throw new Fail(
      `the medrese holds ${total} talebe with the 26 made, and the graph's three pages are 21 to 30: the seeded seats are not what the walk expects (run students.mjs rows-remove first, and look at who else holds a seat)`
    );
  keep("browse", {
    total,
    pages: pagesOf(total),
    last: total - 20,
    a: a.course,
    b: b.course,
  });
  console.log(`rows: 26, total: ${total}, pages: ${pagesOf(total)}`);
}

async function rowsRemove() {
  const out = await query(
    `delete from enrollments where user_id::text like '${PREFIX}%'`
  );
  rmSync(fileOf("browse"), { force: true });
  console.log(`rows removed: ${JSON.parse(out.trim() || '{"rows":0}').rows}`);
}

async function total(args) {
  let lo;
  let hi;
  let madrasah = seed().madrasah;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--between") {
      lo = Number(args[++i]);
      hi = Number(args[++i]);
    } else if (args[i] === "--madrasah") madrasah = args[++i];
    else throw new Fail(usage, 2);
  }
  if (!Number.isInteger(lo) || !Number.isInteger(hi)) throw new Fail(usage, 2);
  const n = await totalOf(madrasah);
  if (n < lo || n > hi)
    throw new Fail(
      `the medrese holds ${n} talebe, and this walk wants ${lo} to ${hi}: the seeded seats are not what it expects (students.mjs rows-remove clears this walk's own, and look at who else holds a seat)`
    );
  console.log(`total: ${n}, pages: ${pagesOf(n)}`);
}

async function leftovers() {
  const out = await query(
    `select id from madrasahs where handle = '${HANDLE}'`
  );
  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l).id);
}

async function medreseDown(tag) {
  const ids = new Set(await leftovers());
  if (existsSync(fileOf(tag)))
    ids.add(JSON.parse(readFileSync(fileOf(tag), "utf8")).madrasah);
  for (const id of ids)
    await must("SYSTEM_ADMIN", "DELETE", `/madrasahs/${id}`, undefined, [404]);
  rmSync(fileOf(tag), { force: true });
  return ids.size === 0 ? "none" : "removed";
}

async function medreseUp(tag) {
  await medreseDown(tag); // a leftover of a crashed walk goes first
  const r = await must("SYSTEM_ADMIN", "POST", "/madrasahs", {
    name: "Boş Medrese Denemesi",
    handle: HANDLE,
    headMuderrisUserId: subOf("basmuderris"),
  });
  keep(tag, { tag, madrasah: r.body.id, name: r.body.name });
  console.log(`medrese up ${tag} ${r.body.id}`);
}

run("students", async () => {
  const [verb, ...rest] = process.argv.slice(2);
  if (verb === "rows" && rest.length === 2) await rows(rest[0], rest[1]);
  else if (verb === "rows-remove") await rowsRemove();
  else if (verb === "total") await total(rest);
  else if (verb === "medrese" && rest[0] === "up" && rest[1])
    await medreseUp(rest[1]);
  else if (verb === "medrese" && rest[0] === "down" && rest[1])
    console.log(`medrese down ${rest[1]} ${await medreseDown(rest[1])}`);
  else throw new Fail(usage, 2);
});
